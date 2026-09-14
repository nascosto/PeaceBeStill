import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUDGETS, verdict, claimRun, beforeLoad, challengedAt, ledgerPath } from "../scripts/audit-budget.mjs";

const MIN = 60 * 1000;
const loads = (site, times) => times.map((at) => ({ site, at }));

// A throwaway ledger per test, so no test touches the real one.
function withLedger(fn) {
  const dir = mkdtempSync(join(tmpdir(), "pbs-ledger-"));
  const before = process.env.PBS_LOAD_LEDGER;
  process.env.PBS_LOAD_LEDGER = join(dir, "page-loads.json");
  return Promise.resolve(fn()).finally(() => {
    if (before === undefined) delete process.env.PBS_LOAD_LEDGER;
    else process.env.PBS_LOAD_LEDGER = before;
    rmSync(dir, { recursive: true, force: true });
  });
}

test("a run that would pass the hourly budget does not start, and says when it may", () => {
  const now = Date.now();
  const hour = loads("linkedin", Array.from({ length: 18 }, (_, i) => now - (i + 1) * MIN));
  assert.equal(verdict(hour, "linkedin", now, 2).ok, true, "18 + 2 fits a budget of 20");
  const refused = verdict(hour, "linkedin", now, 3);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /18 page loads in the last hour.*budget of 20.*Try again after/);
});

test("the daily budget holds even when every hour is under its own", () => {
  const now = Date.now();
  // 50 LinkedIn loads spread over the last day, a few an hour.
  const day = loads("linkedin", Array.from({ length: 50 }, (_, i) => now - (2 * 60 + i * 25) * MIN));
  const answer = verdict(day, "linkedin", now, 1);
  assert.equal(answer.ok, false);
  assert.match(answer.reason, /in the last day/);
});

test("loads older than a day, and another site's loads, do not count", () => {
  const now = Date.now();
  const entries = [...loads("linkedin", Array.from({ length: 60 }, () => now - 25 * 60 * MIN)), ...loads("youtube", Array.from({ length: 29 }, (_, i) => now - i * MIN))];
  assert.equal(verdict(entries, "linkedin", now, 20).ok, true);
  assert.equal(verdict(entries, "youtube", now, 1).ok, true);
  assert.equal(verdict(entries, "youtube", now, 2).ok, false, "29 + 2 passes YouTube's 30");
});

test("loads are spaced: the next one waits out the gap since the last", () => {
  const now = Date.now();
  const answer = verdict(loads("linkedin", [now - 5_000]), "linkedin", now, 1);
  assert.equal(answer.ok, true);
  assert.equal(answer.waitMs, BUDGETS.linkedin.gapMs - 5_000);
  assert.equal(verdict([], "linkedin", now, 1).waitMs, 0);
  assert.throws(() => verdict([], "reddit", now, 1), /no page-load budget/);
});

test("only one run at a time per site, across processes", () => withLedger(() => {
  const release = claimRun("youtube", 1);
  // Another process holding it: this one's own pid stands in for a live one.
  writeFileSync(`${ledgerPath()}.youtube.lock`, String(process.ppid));
  assert.throws(() => claimRun("youtube", 1), /another youtube audit is already running/);
  writeFileSync(`${ledgerPath()}.youtube.lock`, String(process.pid));
  release();
  assert.equal(existsSync(`${ledgerPath()}.youtube.lock`), false, "giving the claim back removes the lock");
  // A lock left by a process that has gone is taken over.
  writeFileSync(`${ledgerPath()}.youtube.lock`, "999999");
  const again = claimRun("youtube", 1);
  again();
}));

test("a claim is refused, and given straight back, when its loads would not fit", () => withLedger(() => {
  const now = Date.now();
  writeFileSync(ledgerPath(), JSON.stringify(loads("youtube", Array.from({ length: 30 }, (_, i) => now - i * MIN))));
  assert.throws(() => claimRun("youtube", 1), /budget of 30/);
  assert.equal(existsSync(`${ledgerPath()}.youtube.lock`), false, "a refused run holds nothing");
}));

test("every load is written to the ledger", () => withLedger(async () => {
  await beforeLoad("youtube");
  const entries = JSON.parse(readFileSync(ledgerPath(), "utf8"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].site, "youtube");
  assert.deepEqual(Object.keys(entries[0]).sort(), ["at", "site"], "nothing but a site and a time");
}));

test("a challenge page is recognised as one, and an ordinary page is not", () => {
  assert.match(challengedAt("https://www.google.com/sorry/index?continue=https://www.youtube.com/"), /unusual-traffic/);
  assert.match(challengedAt("https://consent.youtube.com/m?continue=x"), /consent/);
  for (const path of ["/authwall?x=1", "/login", "/checkpoint/challenge/abc", "/uas/login"]) {
    assert.match(challengedAt("https://www.linkedin.com" + path), /sign-in or security check/, path);
  }
  assert.equal(challengedAt("https://www.linkedin.com/feed/"), null);
  assert.equal(challengedAt("https://www.youtube.com/watch?v=x"), null);
  assert.equal(challengedAt("https://www.linkedin.com/in/login-expert/"), null, "a profile named login is not the login page");
  assert.equal(challengedAt("not a url"), null);
});
