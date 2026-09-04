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
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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

// Keep in step with src/tidy.css.
const SELECTORS = {
  create: 'ytd-masthead #buttons :is(ytd-button-renderer, ytd-topbar-menu-button-renderer):has(button[aria-label="Create"])',
  moreFromYoutube: 'ytd-guide-section-renderer:has(a[href*="music.youtube.com"])',
  subscriptionDots: "ytd-guide-entry-renderer #newness-dot, yt-list-item-view-model .ytListItemViewModelNewContentIndicator",
  descriptionChannelLinks: "ytd-video-description-infocards-section-renderer",
  descriptionCards: "ytd-video-description-transcript-section-renderer, ytd-video-description-course-section-renderer, ytd-video-description-music-section-renderer, #description ytd-horizontal-card-list-renderer, how-this-was-made-section-view-model",
  descriptionChips: 'ytd-watch-metadata #super-title, #description a[href^="/hashtag/"]',
  footer: "ytd-guide-renderer #footer",
  ask: "yt-video-description-youchat-section-view-model, ytd-menu-renderer yt-button-view-model:has(.you-chat-entrypoint-button)",
  summary: "ytd-structured-description-content-renderer #video-summary",
  upcoming: 'ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:is(:has(lockup-attachments-view-model toggle-button-view-model), :has(ytd-rich-grid-media ytd-toggle-button-renderer))',
  expandDescription: "#description-inline-expander #collapse",
  channelTabs: 'yt-tab-shape:is([tab-title="Posts"], [tab-title="Store"])',
};

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
  args: [`--disable-extensions-except=${SRC}`, `--load-extension=${SRC}`, "--window-size=1400,1000", "--no-first-run", "--lang=en-US"],
  defaultViewport: { width: 1400, height: 1000 },
});
const report = { video: VIDEO, extId: EXT_ID };
try {
  const page = await browser.newPage();
  await page.goto(VIDEO, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("ytd-watch-metadata", { timeout: 60000 });
  await sleep(4000);
  report.watch = await page.evaluate(survey, SELECTORS);

  await page.click("#guide-button").catch(() => {});
  await sleep(1500);
  report.withGuide = await page.evaluate(survey, SELECTORS);
  await page.screenshot({ path: OUT + "chromium-watch.png" });

  report.titleCalm = await page.evaluate(async () => {
    const el = document.querySelector("yt-lockup-metadata-view-model h3 a, #video-title");
    if (!el) return "no title element found";
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    if (!node) return "no text node";
    node.nodeValue = "THIS IS A SHOUTING TEST TITLE FOR THE AUDIT";
    await new Promise((r) => setTimeout(r, 700));
    return node.nodeValue;
  });

  const options = await browser.newPage();
  const resp = await options.goto(`chrome-extension://${EXT_ID}/options.html`).catch((e) => ({ error: String(e) }));
  report.optionsPage = resp?.error ?? resp.status();
  if (!resp?.error) {
    report.optionsBoxes = await options.evaluate(() => [...document.querySelectorAll("input[type=checkbox]")].map((b) => `${b.name}=${b.checked}`));
    await options.evaluate(() => chrome.storage.sync.set({ footer: false, dislikeCount: true }));
  }
  await page.bringToFront();
  await sleep(800);
  report.afterToggle = await page.evaluate(survey, SELECTORS);
  for (let i = 0; i < 40 && !report.dislikes; i++) {
    await sleep(500);
    report.dislikes = await page.evaluate(() => document.querySelector(".yt-tidy-dislikes")?.textContent || null);
  }
  report.dislikeButton = await page.evaluate(() => {
    const b = [...document.querySelectorAll("dislike-button-view-model button")].find((e) => e.getClientRects().length > 0);
    return b ? { width: Math.round(b.getBoundingClientRect().width), text: b.textContent.trim() } : null;
  });
  await page.screenshot({ path: OUT + "chromium-after-toggle.png" });
} catch (e) {
  report.error = String(e.stack || e);
} finally {
  await browser.close();
}
writeFileSync(OUT + "chromium-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.error ? 1 : 0;
