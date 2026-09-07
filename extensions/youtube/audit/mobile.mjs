// Live audit of the Firefox for Android surface, in a signed-out headless
// Chromium emulating a phone: loads src/ unpacked, visits m.youtube.com, and
// checks that every switch with a mobile rule has its target present but not
// rendered. Mobile YouTube is a separate application from the desktop site, so
// only the ytm-* rules in hide.css are exercised here.
//
//   npm run audit:mobile
//
// Chromium stands in for Firefox for Android because it emulates a phone
// without a device attached; what is under test is the stylesheet against the
// mobile DOM, which both browsers render the same way. Signed out means the
// Create button, the notifications bell and the Subscriptions pivot item do
// not exist, so those three are checked by hand.
import puppeteer from "puppeteer-core";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium-browser";
// Firefox for Android's own UA, which is what makes YouTube serve m.youtube.com.
const UA = "Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0";
const PHONE = { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 };
const VIDEO = process.argv[2] ?? "https://m.youtube.com/watch?v=dQw4w9WgXcQ";
const HOME = "https://m.youtube.com/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const EXT_ID = [...createHash("sha256").update(SRC).digest("hex").slice(0, 32)]
  .map((h) => String.fromCharCode(97 + parseInt(h, 16))).join("");

const { KEYS, FEATURES } = await (async () => {
  const vm = await import("node:vm");
  const context = { URLSearchParams };
  context.globalThis = context;
  vm.runInNewContext(readFileSync(new URL("../src/core.js", import.meta.url), "utf8"), context);
  return context.PeaceBeStill;
})();

// Split hide.css into the mobile rules (what this audit is for) and the
// desktop ones, which must match nothing on a mobile page.
const MOBILE = {};
const DESKTOP = {};
for (const m of readFileSync(new URL("../src/hide.css", import.meta.url), "utf8")
  .matchAll(/html\[data-peacebestill~="([^"]+)"\]\s*([^{]+?)\s*\{\s*display: none !important;\s*\}/g)) {
  const into = m[2].includes("ytm-") ? MOBILE : DESKTOP;
  into[m[1]] = into[m[1]] ? `${into[m[1]]}, ${m[2]}` : m[2];
}

const PARENTS = [...new Set(FEATURES.map(([, , , , parent]) => parent).filter(Boolean))];
const CHILDREN_PASS = Object.fromEntries(KEYS.map((k) => [k, !PARENTS.includes(k)]));
const EVERYTHING = Object.fromEntries(KEYS.map((k) => [k, true]));

function survey(selectors) {
  const out = {};
  for (const [key, sel] of Object.entries(selectors)) {
    const els = [...document.querySelectorAll(sel)];
    out[key] = { present: els.length, visible: els.filter((e) => e.getClientRects().length > 0).length };
  }
  return out;
}

async function phone(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport(PHONE);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(7000);
  return page;
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM, headless: true,
  args: [`--disable-extensions-except=${SRC}`, `--load-extension=${SRC}`, "--no-first-run", "--lang=en-US",
    "--no-sandbox", "--disable-dev-shm-usage"],
});
const report = { video: VIDEO, extId: EXT_ID, mobileRules: Object.keys(MOBILE) };
try {
  const options = await browser.newPage();
  const resp = await options.goto(`chrome-extension://${EXT_ID}/options.html`).catch((e) => ({ error: String(e) }));
  report.optionsPage = resp?.error ?? resp.status();
  if (resp?.error) throw new Error("could not open the options page: " + resp.error);
  const write = (s) => options.bringToFront().then(() => options.evaluate((v) => chrome.storage.sync.set(v), s));

  await write(CHILDREN_PASS);
  const watch = await phone(browser, VIDEO);
  report.served = await watch.evaluate(() => location.host);
  report.watchChildren = await watch.evaluate(survey, MOBILE);
  await watch.screenshot({ path: OUT + "youtube-mobile-children.png" });

  await write(EVERYTHING);
  await watch.bringToFront();
  await sleep(1500);
  report.watchParents = await watch.evaluate(survey, MOBILE);
  // The desktop rules must be inert here; anything they match is a rule that
  // could hide the wrong thing on a phone.
  report.desktopRulesOnMobile = await watch.evaluate(survey, DESKTOP);
  await watch.screenshot({ path: OUT + "youtube-mobile-parents.png" });

  // Switching one back off must restore it, with no reload.
  await write({ relatedVideos: false });
  await watch.bringToFront();
  await sleep(1500);
  report.afterToggle = await watch.evaluate(survey, MOBILE);
  await watch.close();

  await write(EVERYTHING);
  const home = await phone(browser, HOME);
  report.home = await home.evaluate(survey, MOBILE);
  await home.screenshot({ path: OUT + "youtube-mobile-home.png" });
  await home.close();
} catch (e) {
  report.error = String(e.stack || e);
} finally {
  await browser.close();
}
writeFileSync(OUT + "mobile-report.json", JSON.stringify(report, null, 2));

// A switch fails when its target is on the page and still rendered. The
// children pass leaves the parents off on purpose, so they are still visible
// then by design and are only judged in the pass that turns them on.
const failures = [];
for (const [pass, data, judge] of [
  ["watch/children", report.watchChildren, (k) => !PARENTS.includes(k)],
  ["watch/parents", report.watchParents, () => true],
  ["home", report.home, () => true],
]) {
  for (const [key, r] of Object.entries(data ?? {})) {
    if (judge(key) && r.present > 0 && r.visible > 0) failures.push(`${pass}: ${key} (${r.visible}/${r.present} still rendered)`);
  }
}
// A switch turned back off must show its target again.
if (report.afterToggle?.relatedVideos?.present > 0 && report.afterToggle.relatedVideos.visible === 0) {
  failures.push("afterToggle: relatedVideos stayed hidden after being switched off");
}
const leaked = Object.entries(report.desktopRulesOnMobile ?? {}).filter(([, r]) => r.present > 0).map(([k]) => k);

const rows = [["switch", "watch/children", "watch/parents", "home"]];
for (const key of Object.keys(MOBILE)) {
  const cell = (d) => (d?.[key] ? `${d[key].visible}/${d[key].present}` : "-");
  rows.push([key, cell(report.watchChildren), cell(report.watchParents), cell(report.home)]);
}
const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
console.log("visible/present, so 0/n means the rule worked and 0/0 means nothing to hide here\n");
for (const r of rows) console.log(r.map((c, i) => c.padEnd(w[i])).join("  "));
console.log(`\nserved: ${report.served}   options page: HTTP ${report.optionsPage}`);
console.log(`desktop rules matching on mobile: ${leaked.length ? leaked.join(", ") : "none"}`);
console.log(`${failures.length} failure(s)` + (failures.length ? ":\n  " + failures.join("\n  ") : ""));
process.exitCode = report.error || failures.length ? 1 : 0;
