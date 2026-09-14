// Live audit in a signed-out headless Chromium: loads src/ unpacked, opens a
// watch page, checks that every hiding switch's target is present but not
// rendered, that the description arrives expanded, that a shouting title gets
// calmed by the observer, that a switch flipped from the options page applies
// without a reload, and that the dislike count appears. Prints a JSON report
// and writes screenshots to audit/out/.
//
//   npm run audit:chromium [-- https://www.youtube.com/watch?v=...]
//
// Signed out means the Create button, the subscription dots and (in some
// layouts) the More from YouTube section do not exist; check those by hand.
import puppeteer from "puppeteer-core";
import { whyNotYouTube } from "./served.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const VIDEO = process.argv[2] ?? "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium-browser";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// Chromium derives an unpacked extension's ID from its absolute path.
const EXT_ID = [...createHash("sha256").update(SRC).digest("hex").slice(0, 32)]
  .map((h) => String.fromCharCode(97 + parseInt(h, 16))).join("");

// Keep in step with src/hide.css: read it. Every "display: none" rule gated
// on a feature key contributes its selector (the gate stripped off).
const { KEYS, FEATURES, calmTitle } = await (async () => {
  const vm = await import("node:vm");
  const context = { URLSearchParams };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["settings.js", "core.js"]) vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), context);
  return context.PeaceBeStill;
})();

const SELECTORS = {};
for (const m of readFileSync(new URL("../src/hide.css", import.meta.url), "utf8").matchAll(/html\[data-peacebestill~="([^"]+)"\]\s*([^{]+?)\s*\{\s*display: none !important;\s*\}/g)) {
  SELECTORS[m[1]] = SELECTORS[m[1]] ? `${SELECTORS[m[1]]}, ${m[2]}` : m[2];
}

// A parent switch hides the container its children live in, so with every
// switch on the children cannot be observed at all (and a hidden top bar even
// takes the sidebar button with it). So: one pass with the parents off, which
// exercises every child, then a second with them on, which exercises the
// parents themselves.
// A shouting title written into the page, which the observer must calm. The
// recommendations are tried first and the video's own title after, because a
// signed-out headless browser does not always get the recommendations.
const SHOUTING = "THIS IS A SHOUTING TEST TITLE FOR THE AUDIT";
const TITLE_PROBES = ["yt-lockup-metadata-view-model h3 a", "#video-title", "ytd-watch-metadata h1 yt-formatted-string"];

const PARENTS = [...new Set(FEATURES.map(([, , , , parent]) => parent).filter(Boolean))];
const CHILDREN_PASS = Object.fromEntries(KEYS.map((key) => [key, !PARENTS.includes(key)]));
const EVERYTHING = Object.fromEntries(KEYS.map((key) => [key, true]));
// A switch holding a switch that holds switches (videoDetails holds buttonsBar
// and description). With it on, the middle layer is hidden along with it, so
// that layer's own rules could never be seen working. One pass has every
// switch on except these.
const GRANDPARENTS = PARENTS.filter((p) => FEATURES.some(([key, , , , parent]) => parent === p && PARENTS.includes(key)));
const MIDDLE_PASS = Object.fromEntries(KEYS.map((key) => [key, !GRANDPARENTS.includes(key)]));

function survey(selectors) {
  const out = {};
  for (const [key, sel] of Object.entries(selectors)) {
    const els = [...document.querySelectorAll(sel)];
    out[key] = { present: els.length, visible: els.filter((e) => e.getClientRects().length > 0).length };
  }
  const expander = document.querySelector("#description-inline-expander");
  out.expander = expander ? (expander.hasAttribute("is-expanded") ? "expanded" : "collapsed") : "absent";
  out.tokens = document.documentElement.dataset.ytTidy ?? null;
  return out;
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: [`--disable-extensions-except=${SRC}`, `--load-extension=${SRC}`, "--window-size=1400,1000", "--no-first-run", "--mute-audio", "--lang=en-US"],
  defaultViewport: { width: 1400, height: 1000 },
});
const report = { video: VIDEO, extId: EXT_ID };
try {
  const options = await browser.newPage();
  const resp = await options.goto(`chrome-extension://${EXT_ID}/options.html`).catch((e) => ({ error: String(e) }));
  report.optionsPage = resp?.error ?? resp.status();
  if (resp?.error) throw new Error("could not open the options page: " + resp.error);
  report.optionsBoxes = await options.evaluate(() => [...document.querySelectorAll("input[type=checkbox]")].map((b) => `${b.name}=${b.checked}`));
  const write = (settings) => options.bringToFront().then(() => options.evaluate((s) => chrome.storage.sync.set(s), settings));

  // Pass one: every child switch on, parents off, so each child has a visible
  // container to act inside.
  await write(CHILDREN_PASS);
  const page = await browser.newPage();
  await page.goto(VIDEO, { waitUntil: "domcontentloaded", timeout: 60000 });
  const notYouTube = whyNotYouTube(page.url(), "www.youtube.com");
  if (notYouTube) throw new Error(notYouTube);
  await page.waitForSelector("ytd-watch-metadata", { timeout: 60000 });
  await sleep(4000);
  await page.click("#guide-button").catch(() => {});
  await sleep(1500);
  report.children = await page.evaluate(survey, SELECTORS);
  await page.screenshot({ path: OUT + "youtube-chromium-children.png" });

  report.titleCalm = await page.evaluate(async (probes, shouting) => {
    const el = probes.map((sel) => document.querySelector(sel)).find(Boolean);
    if (!el) return "no title element found";
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    if (!node) return "no text node";
    node.nodeValue = shouting;
    await new Promise((r) => setTimeout(r, 700));
    return node.nodeValue;
  }, TITLE_PROBES, SHOUTING);

  // The dislike count needs the buttons row it attaches to, so it belongs here.
  for (let i = 0; i < 40 && !report.dislikes; i++) {
    await sleep(500);
    report.dislikes = await page.evaluate(() => document.querySelector(".peacebestill-dislikes")?.textContent || null);
  }
  report.dislikeButton = await page.evaluate(() => {
    const b = [...document.querySelectorAll("dislike-button-view-model button")].find((e) => e.getClientRects().length > 0);
    return b ? { width: Math.round(b.getBoundingClientRect().width), text: b.textContent.trim() } : null;
  });

  // The middle layer, its grandparents still off.
  await write(MIDDLE_PASS);
  await page.bringToFront();
  await sleep(1200);
  report.middle = await page.evaluate(survey, SELECTORS);

  // Pass two: the parents as well, applied live to the open tab.
  await write(EVERYTHING);
  await page.bringToFront();
  await sleep(1200);
  report.parents = await page.evaluate(survey, SELECTORS);
  await page.screenshot({ path: OUT + "youtube-chromium-parents.png" });

  // And switching one back off must bring its target back, without a reload.
  await write({ relatedVideos: false });
  await page.bringToFront();
  await sleep(1200);
  report.afterToggle = await page.evaluate(survey, SELECTORS);
} catch (e) {
  report.error = String(e.stack || e);
} finally {
  await browser.close();
}
// Title calming is script, not stylesheet, so no survey sees it: judged here.
report.titleCalmed = report.titleCalm === calmTitle(SHOUTING);
if (!report.titleCalmed) console.error(`title not calmed: got ${JSON.stringify(report.titleCalm)}`);
writeFileSync(OUT + "chromium-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.error || !report.titleCalmed ? 1 : 0;
