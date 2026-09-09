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
  "news", "otherAds", "premium", "jobsPromoted", "networkPeople", "profilePeople", "composer",
  "profileSuggestions", "networkSuggestions", "jobsSuggestions"];
// The advert parent repeats what its children do, so it is checked separately.
// Where the switch name and the mark differ.
const MARK_OF = {};
// Switches that hide a container outright, with the selector they use.
const CONTAINERS = {
  // The parent switch repeats what its children do, so it is checked as one.
  ads: '[data-pbs~="sponsored"], [data-pbs~="otherAds"], [data-pbs~="premium"], [data-pbs~="jobsPromoted"]',
  feed: '[data-testid="mainFeed"]',
  rightRail: 'aside[aria-label="Aside"]',
  leftRail: 'aside[aria-label="Sidebar"]',
  aiAssistant: 'aside[aria-label^="AI-powered assistant"]',
  forBusiness: 'li:has(> button[aria-label="For Business"])',
};

// A panel is hidden properly when nothing of it is left behind: no sibling
// still rendering next to the box, and no empty box where the box used to be.
const panels = () => core +
  ";(() => { const { kindsFor } = globalThis.PeaceBeStill;" + helpers + `
  markFeedItems();
  markModules();
  // Measure the page as it is with nothing switched on, or a panel already
  // hidden by a switch reads as a panel that hides nothing.
  const rootEl = document.documentElement;
  const wasOn = rootEl.dataset.peacebestill || "";
  rootEl.dataset.peacebestill = "";
  const out = { path: location.pathname, panels: [] };
  for (const el of document.querySelectorAll("[data-pbs]")) {
    const parent = el.parentElement;
    const before = el.getBoundingClientRect();
    const was = el.style.display;
    el.style.display = "none";
    const parentAfter = parent ? parent.getBoundingClientRect().height : 0;
    // What still renders beside it, and how much of the parent it did not take.
    const leftovers = parent ? [...parent.children]
      .filter((c) => c !== el && c.getClientRects().length)
      .map((c) => (c.textContent || "").trim().slice(0, 30))
      .filter(Boolean) : [];
    el.style.display = was;
    const parentBefore = parent ? parent.getBoundingClientRect().height : 0;
    out.panels.push({
      kind: el.getAttribute("data-pbs"),
      tag: el.tagName.toLowerCase(),
      height: Math.round(before.height),
      display: getComputedStyle(el).display,
      // Space the parent keeps once the panel is gone, with nothing else in it
      // to justify it: an empty box where a card used to be.
      emptyBoxLeft: leftovers.length === 0 ? Math.round(parentAfter) : 0,
      // How much of the column this box claims. A panel is a part of a column,
      // never nearly all of it.
      shareOfColumn: (() => {
        const column = el.closest('aside[aria-label], section[aria-label], main');
        const room = column ? column.getBoundingClientRect().height : 0;
        return room > 0 ? Math.round((before.height / room) * 100) : 0;
      })(),
      leftovers: leftovers.slice(0, 2),
      text: (el.textContent || "").trim().slice(0, 34),
    });
  }
  rootEl.dataset.peacebestill = wasOn;
  globalThis.__r = JSON.stringify(out);
})(); __r`;

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

// Does a switch hide anything that is not its own? Turn it on alone and see
// what stopped rendering that none of its targets accounts for.
const collateral = (keys, markOf, containers) => core +
  ";(() => { const { kindsFor } = globalThis.PeaceBeStill;" + helpers + `
  markFeedItems();
  markModules();
  const rootEl = document.documentElement;
  const wasOn = rootEl.dataset.peacebestill || "";
  rootEl.dataset.peacebestill = "";
  // Rendered, not "display is not none": a child of a hidden box keeps its own
  // computed display, so a switch that swallowed a neighbouring panel looked
  // innocent. getClientRects is empty for anything inside a hidden ancestor.
  const visible = () => new Set([...document.querySelectorAll("body *")]
    .filter((e) => e.getClientRects().length > 0));
  const before = visible();
  const markOf = ${JSON.stringify(markOf)};
  const containers = ${JSON.stringify(containers)};
  const out = { path: location.pathname, switches: {} };
  const check = (key, selector) => {
    const mine = [...document.querySelectorAll(selector)];
    if (!mine.length) return;
    rootEl.dataset.peacebestill = key;
    const after = visible();
    rootEl.dataset.peacebestill = "";
    const gone = [...before].filter((e) => !after.has(e));
    // Anything that vanished must be one of this switch's targets, or inside one.
    const stray = gone.filter((e) => !mine.some((target) => target === e || target.contains(e)));
    out.switches[key] = { targets: mine.length, hid: gone.length, stray: stray.length,
      strayText: stray.slice(0, 2).map((e) => (e.textContent || "").trim().slice(0, 30)) };
  };
  for (const key of ${JSON.stringify(keys)}) check(key, '[data-pbs~="' + (markOf[key] || key) + '"]');
  for (const [key, selector] of Object.entries(containers)) check(key, selector);
  rootEl.dataset.peacebestill = wasOn;
  globalThis.__r = JSON.stringify(out);
})(); __r`;

const wantCollateral = process.argv.includes("--collateral");
const wantPanels = process.argv.includes("--panels");
const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const { evaluate, goTo, close } = await linkedInTab();
let problems = 0;
try {
  for (const path of paths.length ? paths : [null]) {
    if (path) {
      await goTo(new URL(path, "https://www.linkedin.com").href);
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (wantCollateral) {
      const found = JSON.parse(await evaluate(collateral(MARKED, MARK_OF, CONTAINERS)));
      console.log("\n" + found.path + "  (side effects)");
      for (const [key, r] of Object.entries(found.switches)) {
        const verdict = r.stray ? `STRAY ${r.stray}  ${JSON.stringify(r.strayText)}` : "clean";
        if (r.stray) problems++;
        console.log(`  ${key.padEnd(16)} ${String(r.targets).padStart(3)} targets, ${String(r.hid).padStart(4)} hidden  ${verdict}`);
      }
      continue;
    }
    if (wantPanels) {
      const found = JSON.parse(await evaluate(panels()));
      console.log("\n" + found.path + "  (panels)");
      for (const panel of found.panels) {
        const complaint = panel.shareOfColumn >= 60 ? `  <-- ${panel.shareOfColumn}% of its column`
          : panel.emptyBoxLeft > 8 ? `  <-- leaves a ${panel.emptyBoxLeft}px box` : "";
        if (panel.shareOfColumn >= 60) problems++;
        console.log(`  ${panel.kind.padEnd(16)} ${String(panel.height).padStart(5)}px ${panel.display.padEnd(9)} ${JSON.stringify(panel.text)}${complaint}`);
        if (panel.leftovers.length) console.log(`  ${"".padEnd(16)} beside it: ${JSON.stringify(panel.leftovers)}`);
      }
      continue;
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
