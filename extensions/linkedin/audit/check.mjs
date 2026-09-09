#!/usr/bin/env node
// Checks every switch against whatever LinkedIn page the dev browser is on,
// reporting per switch how many targets it found and how many actually stopped
// rendering. It is the equivalent of the YouTube audits, except it cannot be
// automated end to end: LinkedIn is behind a login, so it drives a profile you
// have signed into by hand.
//
//   npm run dev:linkedin                              # once, in another terminal
//   npm run check:linkedin                            # the page it is showing
//   npm run check:linkedin -- /feed/ /in/me/ /jobs/   # visiting each in turn
//
// It uses the extension's own core.js and lifts the marking pass out of its
// content.js, so what it exercises is exactly what ships.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { linkedInTab } from "./rdp.mjs";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const core = readFileSync(SRC + "core.js", "utf8");
const content = readFileSync(SRC + "content.js", "utf8");
const helpers = content.slice(content.indexOf("  const FEED_ITEMS ="), content.indexOf("  const MARKED = ["));

// Switches whose target is something content.js marks. The rest (the whole
// feed, the two rails, blackout) hide a container the stylesheet can name on
// its own, and are checked by the selector column below instead.
const MARKED = ["sponsored", "suggested", "recommended", "socialProof", "games",
  "news", "otherAds", "premium", "jobsPromoted", "peopleYouMayKnow", "suggestions", "composer"];
// Where the switch name and the mark differ.
const MARK_OF = { peopleYouMayKnow: "pymk" };
// Switches that hide a container outright, with the selector they use.
const CONTAINERS = {
  feed: '[data-testid="mainFeed"]',
  rightRail: 'aside[aria-label="Aside"]',
  leftRail: 'aside[aria-label="Sidebar"]',
  aiAssistant: 'aside[aria-label^="AI-powered assistant"]',
};

const report = (keys, markOf, containers) => core +
  ";(() => { const { kindsFor } = globalThis.PeaceBeStill;" + helpers + `
  markFeedItems();
  markModules();
  const root = document.documentElement;
  const was = root.dataset.peacebestill || "";
  const hiddenNow = () => [...document.querySelectorAll("body *")]
    .filter((e) => getComputedStyle(e).display === "none").length;
  const baseline = hiddenNow();
  const markOf = ${JSON.stringify(markOf)};
  const containers = ${JSON.stringify(containers)};
  const out = { path: location.pathname, switches: {} };
  const measure = (key, selector) => {
    const targets = document.querySelectorAll(selector).length;
    root.dataset.peacebestill = key;
    const hid = hiddenNow() - baseline;
    root.dataset.peacebestill = was;
    out.switches[key] = { targets, hid };
  };
  for (const key of ${JSON.stringify(keys)}) measure(key, '[data-pbs~="' + (markOf[key] || key) + '"]');
  for (const [key, selector] of Object.entries(containers)) measure(key, selector);
  globalThis.__r = JSON.stringify(out);
})(); __r`;

const paths = process.argv.slice(2);
const { evaluate, goTo, close } = await linkedInTab();
let problems = 0;
try {
  for (const path of paths.length ? paths : [null]) {
    if (path) {
      await goTo(new URL(path, "https://www.linkedin.com").href);
      await new Promise((r) => setTimeout(r, 5000));
    }
    const result = JSON.parse(await evaluate(report(MARKED, MARK_OF, CONTAINERS)));
    console.log("\n" + result.path);
    const idle = [];
    for (const [key, { targets, hid }] of Object.entries(result.switches)) {
      if (!targets) { idle.push(key); continue; }
      const ok = hid >= targets;
      if (!ok) problems++;
      console.log(`  ${ok ? "ok  " : "FAIL"} ${key.padEnd(18)} ${targets} found, ${hid} hidden`);
    }
    if (idle.length) console.log("  --   not on this page: " + idle.join(", "));
  }
} finally {
  close();
}
if (problems) {
  console.error(`\n${problems} switch(es) found a target and failed to hide it.`);
  process.exit(1);
}
