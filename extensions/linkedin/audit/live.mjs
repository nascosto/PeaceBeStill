#!/usr/bin/env node
// Drives the real extension, one setting at a time, and reports what actually
// disappeared from the page.
//
//   npm run dev:linkedin              # once, in another terminal
//   node extensions/linkedin/audit/live.mjs /feed/ /mynetwork/grow/
//
// The other audit lifts the marking code out of content.js and sets the
// attribute itself, so it only ever proves the harness agrees with itself.
// This one writes the setting through the extension's own storage, lets the
// content script do its work, and compares the page against a baseline taken
// with everything off. What it prints is what a person would see go.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RDP, devPort, session } from "./rdp.mjs";
import { snapshot } from "./snapshot.mjs";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const core = readFileSync(SRC + "core.js", "utf8");
const context = { URLSearchParams, globalThis: null };
context.globalThis = context;
(await import("node:vm")).runInNewContext(core, context);
const { FEATURES, KEYS, parentOf } = context.PeaceBeStill;

// A switch and everything nested under it. Turning on a parent marks the page
// with the children's names, not the parent's -- switching off every advert
// leaves marks reading "sponsored" and "premium", never "ads" -- so a parent's
// tally has to gather its family's.
function family(key) {
  const all = [key];
  for (let i = 0; i < all.length; i++) {
    for (const k of KEYS) if (parentOf(k) === all[i] && !all.includes(k)) all.push(k);
  }
  return all;
}

// LinkedIn signs a session out when it dislikes the traffic, and every reading
// after that is of a page nobody is logged into -- which reads as every switch
// working perfectly, since nothing is there to hide. Better to stop and say so.
function signedOut(path) {
  return /^\/(authwall|login|checkpoint|uas)(\/|$)/.test(path || "");
}

function tally(marks, key) {
  let found = 0;
  let showing = 0;
  for (const k of family(key)) {
    if (!marks[k]) continue;
    found += marks[k].found;
    showing += marks[k].showing;
  }
  return found ? { found, showing } : null;
}
const labelOf = (key) => (FEATURES.find(([k]) => k === key) || [])[1] || key;

// What the page shows. Free-form landmarks proved useless: LinkedIn's
// suggestions differ on every load, so a panel headed "People you may know
// from <a school>" reads as having vanished no matter what was switched on.
// So: a fixed list of things that either are on the page or are not, plus
// counts. Anything volatile is deliberately absent.
const PROBES = {
  "Home (nav)": '[data-testid="primary-nav"] li:has(> button[aria-label^="Home"])',
  "My Network (nav)": '[data-testid="primary-nav"] li:has(> a[href*="/mynetwork"])',
  "Jobs (nav)": '[data-testid="primary-nav"] li:has(> a[href*="/jobs"])',
  "Messaging (nav)": '[data-testid="primary-nav"] li:has(> a[href*="/messaging"])',
  "Notifications (nav)": '[data-testid="primary-nav"] li:has(> a[href*="/notifications"])',
  "Profile (nav)": '[data-testid="primary-nav"] li:has(> button img)',
  "For Business (nav)": '[data-testid="primary-nav"] li:has(> button[aria-label="For Business"])',
  "the feed": '[data-testid="mainFeed"]',
  "left column": 'aside[aria-label="Sidebar"]',
  "right column": 'aside[aria-label="Aside"]',
  "the page itself": 'section[aria-label="Primary content"]',
};
// Panels named by their words rather than a selector.
const BY_TEXT = {
  "the advert": "Ad Options",
  "Premium upsell": "Try Premium for $0",
  "Manage my network": "Manage my network",
  "LinkedIn News": "LinkedIn News",
  "the puzzles": "Zip",
  "People you may know": "People you may know",
  "Suggestions for you": "Suggestions for you",
  "Start a post": "Start a post",
};

const SNAPSHOT = `JSON.stringify((${snapshot})(${JSON.stringify(PROBES)}, ${JSON.stringify(BY_TEXT)}))`;

// Nothing here may hang in silence. Every stage says what it is doing, and a
// watchdog gives up if a stage stops making progress -- a run that sat for
// eleven minutes without printing a byte is what this exists to prevent.
let doing = "starting up";
let ticked = Date.now();
const step = (what) => { doing = what; ticked = Date.now(); process.stderr.write(`    .. ${what}\n`); };
const STALL_MS = 90000;
const watchdog = setInterval(() => {
  if (Date.now() - ticked < STALL_MS) return;
  process.stderr.write(`\nGave up: stuck on "${doing}" for ${Math.round((Date.now() - ticked) / 1000)}s.\n`);
  process.exit(1);
}, 5000);
watchdog.unref();

const paths = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!paths.length) paths.push("/feed/");

step("finding the debugging port");
const port = devPort();
step("connecting to " + port);
const rdp = await RDP.connect(port);
step("waiting for the greeting");
await rdp.await((m) => m.from === "root");
step("asking which add-ons are loaded");
const { addons } = await rdp.request({ to: "root", type: "listAddons" }, (m) => Array.isArray(m.addons));
const mine = addons.find((a) => /PeaceBeStill - LinkedIn/.test(String(a.name)));
rdp.close();
if (!mine) throw new Error("the extension is not loaded; run npm run dev:linkedin");
const OPTIONS = (mine.manifestURL || "").replace(/manifest\.json$/, "") + "options.html";

// Two tabs, so that neither has to become the other. The extension's storage
// is reachable only from an extension page, and the thing to look at is
// LinkedIn: with one tab those alternated, and every setting cost a pair of
// full page loads. Hundreds an hour from one profile is what a bot looks like,
// and LinkedIn stopped the session over it. Now the options page keeps its own
// tab, and LinkedIn is loaded once per page audited and then left alone --
// settings arrive over storage.onChanged, which is how they reach an open tab
// for a real user anyway.
step("attaching to the browser");
const live = await session();
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

step("opening the options page");
const existing = await live.listTabs();
const settings = await live.attach(existing[0]);
await settings.goTo(OPTIONS);

step("opening a tab for LinkedIn");
await settings.evaluate(`browser.tabs.create({ url: ${JSON.stringify("https://www.linkedin.com" + paths[0])} }).then((t) => t.id)`);
await settle(4000);
const page = await live.attachMatching(/linkedin\.com/);
step("ready");

async function store(values) {
  step("writing " + (Object.keys(values)[0] || "nothing"));
  await settings.evaluate(`(async () => {
    await browser.storage.sync.clear();
    ${Object.keys(values).length ? `await browser.storage.sync.set(${JSON.stringify(values)});` : ""}
    return "ok";
  })()`);
  // Long enough for the content script to hear the change and re-apply: it
  // runs at once, and its marking pass is debounced by 200ms.
  await settle(900);
}

// Every full load of a real LinkedIn page is a cost to the account, so they are
// counted and the total is printed. A run that starts making hundreds of these
// again should be obvious from its own output.
let loads = 0;

async function goToPage(path) {
  loads += 1;
  step("opening " + path);
  const landed = await page.goTo("https://www.linkedin.com" + path);
  step("landed at " + (landed || "(timed out)"));
  await settle(6000);
  return landed;
}

async function look() {
  // Three attempts at getting our own answer back. The debugging protocol has
  // handed us another evaluation's result more than once, and rather than keep
  // guessing at why, the reading is simply checked and taken again: a snapshot
  // is a known shape, so a wrong answer is obvious.
  for (let attempt = 0; attempt < 3; attempt++) {
    step("reading the page");
    const raw = await page.evaluate(SNAPSHOT);
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.probes && typeof parsed.feedItems === "number") return parsed;
    } catch { /* not ours; ask again */ }
    await settle(1000);
  }
  throw new Error("could not read the page after three attempts");
}

try {
  for (const path of paths) {
    await store({});
    await goToPage(path);
    const base = await look();
    const present = Object.entries(base.probes).filter(([, n]) => n > 0).map(([name]) => name);
    console.log(`\n${path}`);
    console.log(`  on the page: ${present.join(", ")}${base.feedItems ? `, ${base.feedItems} feed items` : ""}`);

    for (const key of KEYS) {
      if (key === "blackout" || key === "homeRedirect") continue;
      await store({ [key]: true });
      const now = await look();
      if (signedOut(now.path)) {
        console.log(`\n  Signed out at ${now.path} -- LinkedIn ended the session.`);
        console.log("  Sign in again in the dev browser, then re-run. Nothing below here was measured.");
        process.exit(1);
      }
      // The page is not reloaded between settings, so it can only have moved
      // because the extension moved it. What the extension applied is worth
      // checking too: a switch that never arrived and a switch that does
      // nothing otherwise print the same thing, which is nothing.
      const landed = now.path === base.path;
      const applied = now.attr === key;
      const suspected = present.filter((name) => now.probes[name] === 0);
      const feedTook = base.feedItems - now.feedItems;
      const marked = tally(now.marks, key);

      if (!applied) {
        console.log(`  ${key.padEnd(17)} SKIPPED: the setting never reached the page (attribute was ${JSON.stringify(now.attr)})`);
        continue;
      }
      if (!landed) {
        // Taking a page away is supposed to take you off it, so being somewhere
        // else is the feature working, not the measurement failing. It is also
        // the one thing that costs a page load: we have to come back.
        console.log(`  ${key.padEnd(17)} sent us to ${now.path}`);
        await store({});
        await goToPage(path);
        continue;
      }
      if (!suspected.length && !marked && feedTook <= 0) {
        console.log(`  ${key.padEnd(17)} nothing on this page to hide`);
        continue;
      }

      // A panel missing once is as likely to be a panel that never rendered as
      // one that was hidden, so it is switched off and looked at again, then on
      // again: a take counts only if the thing came back without the setting
      // and went again with it. Because the page is never reloaded, all three
      // readings are of the very same elements -- which is a far better control
      // than three renders of a page LinkedIn never serves the same way twice.
      await store({});
      const after = await look();
      await store({ [key]: true });
      const again = await look();
      const took = suspected.filter((name) => after.probes[name] > 0 && again.probes[name] === 0);
      // The extension's own ledger, read from the settled reading rather than
      // the first: marking happens after the feed renders, and the first look
      // can be taken before it has caught up.
      const ledger = tally(again.marks, key) || marked;

      // Judged on the settled reading: the first one can be taken mid-render,
      // when something marked has not been hidden yet and looks like a failure.
      if (ledger && ledger.showing > 0) {
        console.log(`  ${key.padEnd(17)} FAILED: ${ledger.showing} of ${ledger.found} marked still showing`);
        continue;
      }
      const what = [...took];
      if (ledger) what.push(`${ledger.found - ledger.showing} of ${ledger.found} marked`);
      console.log(`  ${key.padEnd(17)} ${what.length ? what.join(", ") : "no confirmed effect"}`);

      // Feed length is not the same twice, so a count is a hint and never a
      // verdict. It is worth printing only when nothing else explains posts
      // going missing -- that is the shape collateral damage takes.
      // Posts live inside the feed, so taking the feed takes them with it:
      // that is the switch working, not damage to something else.
      const feedItself = took.includes("the feed");
      if (!ledger && !feedItself && feedTook > 0 && base.feedItems - again.feedItems > 0) {
        console.log(`  ${"".padEnd(17)} (unexplained: ${feedTook} fewer feed items, with nothing marked)`);
      }
      const phantom = suspected.filter((name) => !took.includes(name));
      if (phantom.length) console.log(`  ${"".padEnd(17)} (unconfirmed, absent either way: ${phantom.join(", ")})`);
    }
  }
} finally {
  // Leave every switch off, and leave the LinkedIn tab open: closing it would
  // only mean loading it again next time.
  await store({});
  console.log(`\n${loads} LinkedIn page load${loads === 1 ? "" : "s"} for ${paths.length} page${paths.length === 1 ? "" : "s"}.`);
  live.close();
}
