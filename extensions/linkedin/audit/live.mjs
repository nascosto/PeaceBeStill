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
import { RDP, devPort, linkedInTab } from "./rdp.mjs";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const core = readFileSync(SRC + "core.js", "utf8");
const context = { URLSearchParams, globalThis: null };
context.globalThis = context;
(await import("node:vm")).runInNewContext(core, context);
const { FEATURES, KEYS } = context.PeaceBeStill;
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

const SNAPSHOT = `JSON.stringify((() => {
  const shown = (selector) => [...document.querySelectorAll(selector)]
    .filter((e) => e.getClientRects().length).length;
  const shownText = (needle) => [...document.querySelectorAll("h1,h2,h3,p,span,div,button")]
    .filter((e) => !e.children.length && (e.textContent || "").trim().startsWith(needle) && e.getClientRects().length).length;
  const out = { probes: {}, feedItems: shown('[data-testid="mainFeed"] [role="listitem"]') };
  for (const [name, selector] of Object.entries(${JSON.stringify(PROBES)})) out.probes[name] = shown(selector);
  for (const [name, needle] of Object.entries(${JSON.stringify(BY_TEXT)})) out.probes[name] = shownText(needle);
  return out;
})())`;

const paths = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!paths.length) paths.push("/feed/");

const rdp = await RDP.connect(devPort());
await rdp.await((m) => m.from === "root");
const { addons } = await rdp.request({ to: "root", type: "listAddons" }, (m) => Array.isArray(m.addons));
const mine = addons.find((a) => /PeaceBeStill - LinkedIn/.test(String(a.name)));
rdp.close();
if (!mine) throw new Error("the extension is not loaded; run npm run dev:linkedin");
const OPTIONS = (mine.manifestURL || "").replace(/manifest\.json$/, "") + "options.html";

const tab = await linkedInTab();
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

async function store(settings) {
  await tab.goTo(OPTIONS);
  await settle(1200);
  await tab.evaluate(`(async () => {
    await browser.storage.sync.clear();
    ${Object.keys(settings).length ? `await browser.storage.sync.set(${JSON.stringify(settings)});` : ""}
    return "ok";
  })()`);
}

async function look(path) {
  await tab.goTo("https://www.linkedin.com" + path);
  await settle(7000);
  return JSON.parse(await tab.evaluate(SNAPSHOT));
}

try {
  for (const path of paths) {
    await store({});
    const base = await look(path);
    const present = Object.entries(base.probes).filter(([, n]) => n > 0).map(([name]) => name);
    console.log(`\n${path}`);
    console.log(`  on the page: ${present.join(", ")}${base.feedItems ? `, ${base.feedItems} feed items` : ""}`);

    for (const key of KEYS) {
      if (key === "blackout" || key === "homeRedirect") continue;
      await store({ [key]: true });
      const now = await look(path);
      const suspected = present.filter((name) => now.probes[name] === 0);
      const feedTook = base.feedItems - now.feedItems;
      if (!suspected.length && feedTook <= 0) continue;

      // LinkedIn does not put the same page up twice: a panel missing once is
      // as likely to be a panel that did not render as one that was hidden. So
      // switch it back off and look again, then switch it on and look again.
      // A take counts only if the thing came back without the setting and went
      // again with it -- one round of that is a coin toss, which is how three
      // unrelated settings all appeared to hide "People you may know".
      await store({});
      const after = await look(path);
      await store({ [key]: true });
      const again = await look(path);
      const took = suspected.filter((name) => after.probes[name] > 0 && again.probes[name] === 0);
      const feedBack = after.feedItems;
      const what = [...took];
      if (feedTook > 0 && feedBack >= base.feedItems - 1) {
        what.push(`${feedTook} of ${base.feedItems} feed items`);
      }
      const phantom = suspected.filter((name) => !took.includes(name));
      if (!what.length && !phantom.length) continue;
      if (what.length) console.log(`  ${key.padEnd(17)} ${what.join(", ")}`);
      if (phantom.length) console.log(`  ${"".padEnd(17)} (not confirmed, absent either way: ${phantom.join(", ")})`);
    }
  }
} finally {
  await store({});
  tab.close();
}
