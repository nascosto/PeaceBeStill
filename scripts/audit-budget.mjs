// How much the live audits may ask of the real sites, kept to what one person
// browsing would ask.
//
// The audits load real YouTube and LinkedIn pages. Each run is small, but runs
// add up: on 2026-09-09 LinkedIn signed the account out after a few hundred
// loads in an hour, and on 2026-09-14 Google began answering this network's
// YouTube traffic with its "unusual traffic" page after a day of repeated runs
// from two sessions at once. Nothing in any single run was the problem; the
// total was. So the total is what is limited here:
//
// - one audit run per site at a time, whichever checkout or session starts it;
// - a budget of page loads per hour and per day for each site, counted across
//   every run, in a ledger outside the repository;
// - a gap between one load and the next, so a run never bursts.
//
// A run says up front how many loads it will make, and does not start if they
// would not fit. Every load then goes through beforeLoad, which waits for the
// gap and records it. The ledger lives in ~/.cache/peacebestill (or
// PBS_LOAD_LEDGER) and holds only a site name and a time per load.
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// LinkedIn's are stricter: it is a signed-in account, and it has already been
// flagged once. A full run of five LinkedIn pages is about seventeen loads, and
// one of the three YouTube audits is one to four.
export const BUDGETS = {
  youtube: { perHour: 30, perDay: 120, gapMs: 3_000 },
  linkedin: { perHour: 20, perDay: 50, gapMs: 20_000 },
};

export function ledgerPath() {
  return process.env.PBS_LOAD_LEDGER || join(homedir(), ".cache", "peacebestill", "page-loads.json");
}

const at = (ms) => new Date(ms).toLocaleTimeString();

// Whether `planned` more loads of `site` fit, given the loads already made, and
// if they do, how long to wait before the next one. Pure, so it can be tested.
export function verdict(entries, site, now, planned = 1, budgets = BUDGETS) {
  const budget = budgets[site];
  if (!budget) throw new Error(`no page-load budget for ${site}`);
  const mine = entries.filter((entry) => entry.site === site && now - entry.at < DAY);
  const lastHour = mine.filter((entry) => now - entry.at < HOUR);
  if (lastHour.length + planned > budget.perHour) {
    const frees = Math.min(...lastHour.map((entry) => entry.at)) + HOUR;
    return { ok: false, reason: `${site}: ${lastHour.length} page loads in the last hour, and ${planned} more would pass the budget of ${budget.perHour}. Try again after ${at(frees)}.` };
  }
  if (mine.length + planned > budget.perDay) {
    const frees = Math.min(...mine.map((entry) => entry.at)) + DAY;
    return { ok: false, reason: `${site}: ${mine.length} page loads in the last day, and ${planned} more would pass the budget of ${budget.perDay}. Try again after ${at(frees)}.` };
  }
  const last = mine.length ? Math.max(...mine.map((entry) => entry.at)) : -Infinity;
  return { ok: true, waitMs: Math.max(0, last + budget.gapMs - now) };
}

function readLedger() {
  try {
    const now = Date.now();
    return JSON.parse(readFileSync(ledgerPath(), "utf8")).filter((entry) => now - entry.at < DAY);
  } catch {
    return [];
  }
}

function writeLedger(entries) {
  mkdirSync(dirname(ledgerPath()), { recursive: true });
  writeFileSync(ledgerPath(), JSON.stringify(entries));
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// Claims the one run allowed against `site`, if `planned` loads fit the budget.
// Throws, before any browser is started, when another run holds the site or the
// loads would not fit. Returns a function that gives the claim back; it is also
// given back when the process exits.
export function claimRun(site, planned) {
  const lock = `${ledgerPath()}.${site}.lock`;
  mkdirSync(dirname(lock), { recursive: true });
  try {
    const fd = openSync(lock, "wx");
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
  } catch {
    const holder = Number(readFileSync(lock, "utf8"));
    if (holder && holder !== process.pid && alive(holder)) {
      throw new Error(`another ${site} audit is already running (process ${holder}); wait for it to finish.`);
    }
    unlinkSync(lock); // left behind by a run that is no longer there
    return claimRun(site, planned);
  }
  const release = () => {
    try {
      if (Number(readFileSync(lock, "utf8")) === process.pid) unlinkSync(lock);
    } catch {
      // already gone
    }
  };
  process.on("exit", release);
  const answer = verdict(readLedger(), site, Date.now(), planned);
  if (!answer.ok) {
    release();
    throw new Error(answer.reason);
  }
  return release;
}

// claimRun for an audit's own top level: a refusal is a sentence and an exit
// code, not a stack trace -- it is the budget working, not a bug.
export function claimRunOrExit(site, planned) {
  try {
    return claimRun(site, planned);
  } catch (error) {
    console.error(`Not starting: ${error.message}`);
    process.exit(2);
  }
}

// Call before every load of a real page of `site`: waits out the gap since the
// last load, refuses if the budget has run out mid-run, and records the load.
export async function beforeLoad(site) {
  const answer = verdict(readLedger(), site, Date.now(), 1);
  if (!answer.ok) throw new Error(answer.reason);
  if (answer.waitMs) await new Promise((resolve) => setTimeout(resolve, answer.waitMs));
  const entries = readLedger();
  entries.push({ site, at: Date.now() });
  writeLedger(entries);
}

// A page that is not the site at all: a sign-in wall or a check that the
// visitor is human. The audits stop at one rather than measure it, and rather
// than keep asking a site that has started to object.
export function challengedAt(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (/(^|\.)google\.[a-z.]+$/.test(parsed.host) && parsed.pathname.startsWith("/sorry")) return "Google's unusual-traffic page";
  if (/^consent\./.test(parsed.host)) return "a consent page";
  if (/(^|\.)linkedin\.com$/.test(parsed.host) && /^\/(authwall|login|checkpoint|uas)(\/|$)/.test(parsed.pathname)) return "LinkedIn's sign-in or security check";
  return null;
}
