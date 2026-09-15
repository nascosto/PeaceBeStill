// Live audit in a signed-out headless Firefox, driven over Marionette (built
// into Firefox; no driver to install): installs src/ as a temporary add-on,
// opens a watch page, checks that every hiding switch's target is present but
// not rendered, that the description arrives expanded, that a switch flipped
// through storage applies, and that the dislike count appears. Prints a JSON
// report and writes screenshots to audit/out/.
//
//   npm run audit:firefox [-- https://www.youtube.com/watch?v=...]
//
// Signed out means the Create button and the subscription dots do not exist,
// and the sidebar may not render at all; check those by hand.
import { claimRunOrExit, beforeLoad, challengedAt } from "../../../scripts/audit-budget.mjs";
import net from "node:net";
import { whyNotYouTube, AD_BLOCKER_BAIT, baitProblem } from "./served.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const VIDEO = process.argv[2] ?? "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const FIREFOX = process.env.FIREFOX ?? "/usr/bin/firefox";
const PORT = 2828;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// --- A tiny Marionette client (protocol 3: "<len>:<json>" frames) ------------
class Marionette {
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); this.buffer = ""; socket.on("data", (d) => this.onData(d)); }
  static async connect(port, tries = 60) {
    for (let i = 0; i < tries; i++) {
      try {
        const socket = await new Promise((resolve, reject) => { const s = net.connect(port, "127.0.0.1"); s.once("connect", () => resolve(s)); s.once("error", reject); });
        const client = new Marionette(socket);
        await client.hello;
        return client;
      } catch { await sleep(500); }
    }
    throw new Error("Marionette did not come up");
  }
  onData(chunk) {
    this.buffer += chunk.toString("utf8");
    for (;;) {
      const colon = this.buffer.indexOf(":");
      if (colon === -1) return;
      const len = Number(this.buffer.slice(0, colon));
      const bytes = Buffer.from(this.buffer.slice(colon + 1), "utf8");
      if (bytes.length < len) return;
      const msg = JSON.parse(bytes.subarray(0, len).toString("utf8"));
      this.buffer = bytes.subarray(len).toString("utf8");
      if (!Array.isArray(msg)) { this.helloResolve?.(msg); continue; }
      const [, id, error, result] = msg;
      const p = this.pending.get(id); this.pending.delete(id);
      if (!p) continue;
      error ? p.reject(new Error(`${error.error}: ${error.message}`)) : p.resolve(result);
    }
  }
  get hello() { return this._hello ??= new Promise((resolve) => { this.helloResolve = resolve; }); }
  send(name, params = {}) {
    const id = ++this.id;
    const body = JSON.stringify([0, id, name, params]);
    this.socket.write(`${Buffer.byteLength(body)}:${body}`);
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  script(script, args = []) { return this.send("WebDriver:ExecuteScript", { script, args }).then((r) => r.value); }
  asyncScript(script, args = []) { return this.send("WebDriver:ExecuteAsyncScript", { script, args }).then((r) => r.value); }
}

// --- Firefox with a throwaway profile ----------------------------------------
const profile = mkdtempSync(join(tmpdir(), "peacebestill-audit-"));
writeFileSync(join(profile, "user.js"), [
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("browser.startup.page", 0);',
  'user_pref("browser.startup.homepage", "about:blank");',
  'user_pref("browser.aboutwelcome.enabled", false);',
  'user_pref("app.update.enabled", false);',
  // Headless Firefox still plays the video's sound out loud.
  'user_pref("media.volume_scale", "0.0");',
  // Switching an extension off can close the tab it owns, and a window that
  // loses its last tab closes -- the last window taking Firefox down with it.
  'user_pref("browser.tabs.closeWindowWithLastTab", false);',
  `user_pref("marionette.port", ${PORT});`,
  "",
].join("\n"));
// --remote-allow-system-access lets the audit read the add-on's internal UUID.
// Every real page load counts against a budget shared by all audit runs on this
// machine (scripts/audit-budget.mjs), so claim this run's before starting.
// One load: the watch page, then every pass applied to it live.
claimRunOrExit("youtube", 1);

const firefox = spawn(FIREFOX, ["--marionette", "--remote-allow-system-access", "--headless", "--no-remote", "--new-instance", "--profile", profile, "about:blank"], { stdio: "ignore" });

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

const SELECTORS = {};
for (const m of readFileSync(new URL("../src/hide.css", import.meta.url), "utf8").matchAll(/html\[data-peacebestill~="([^"]+)"\]\s*([^{]+?)\s*\{\s*display: none !important;\s*\}/g)) {
  SELECTORS[m[1]] = SELECTORS[m[1]] ? `${SELECTORS[m[1]]}, ${m[2]}` : m[2];
}
const SURVEY = `
  const selectors = arguments[0]; const out = {};
  for (const [key, sel] of Object.entries(selectors)) {
    const els = [...document.querySelectorAll(sel)];
    out[key] = { present: els.length, visible: els.filter((e) => e.getClientRects().length > 0).length };
  }
  const expander = document.querySelector("#description-inline-expander");
  out.expander = expander ? (expander.hasAttribute("is-expanded") ? "expanded" : "collapsed") : "absent";
  out.tokens = document.documentElement.dataset.ytTidy ?? null;
  return out;`;

async function waitForWatch(client, ms = 45000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await client.script('return !!document.querySelector("ytd-watch-metadata #description-inline-expander, ytd-watch-metadata #title");')) return true;
    await sleep(1000);
  }
  return false;
}

async function openGuide(client) {
  for (let i = 0; i < 3 && !(await client.script('return !!document.querySelector("ytd-guide-renderer #footer");')); i++) {
    await client.script('document.querySelector("#guide-button")?.click();');
    await sleep(2500);
  }
}

const report = { video: VIDEO };
let client;
try {
  client = await Marionette.connect(PORT);
  await client.send("WebDriver:NewSession", { capabilities: { alwaysMatch: {} } });
  await client.send("WebDriver:SetWindowRect", { width: 1400, height: 1000 });
  // The machine's enterprise policy installs its extensions into every
  // profile, this throwaway one included -- content blockers that would pass
  // for our switches working, and PeaceBeStill itself as published on AMO,
  // under the same ID as the copy being audited. So: let the policy finish,
  // switch every one of its extensions off, and only then install src/, which
  // takes the ID over from the published copy for this session. The audit
  // then checks that the one extension running is src/, and stops if not:
  // measuring the published build, or anything alongside ours, would pass
  // for this checkout working.
  await client.send("Marionette:SetContext", { value: "chrome" });
  report.policyExtensions = await client.send("WebDriver:ExecuteAsyncScript", { script: `const done = arguments[arguments.length - 1];
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const wanted = Object.entries(Services.policies.getActivePolicies()?.ExtensionSettings ?? {})
      .filter(([id, setting]) => id !== "*" && ["normal_installed", "force_installed"].includes(setting.installation_mode)).map(([id]) => id);
    const started = Date.now();
    (async function poll() {
      const have = new Set((await AddonManager.getAddonsByTypes(["extension"])).map((a) => a.id));
      const missing = wanted.filter((id) => !have.has(id));
      if (!missing.length || Date.now() - started > 30000) return done({ wanted, missing });
      setTimeout(poll, 250);
    })();`, timeout: 40000 }).then((r) => r.value);
  report.otherExtensionsDisabled = await client.send("WebDriver:ExecuteAsyncScript", { script: `const done = arguments[arguments.length - 1];
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    (async () => {
      const others = (await AddonManager.getAddonsByTypes(["extension"])).filter((a) => a.id !== arguments[0] && !a.isSystem && !a.isBuiltin && a.isActive);
      for (const a of others) await a.disable();
      done(others.map((a) => a.id));
    })().catch((e) => done("ERROR " + e));`, args: ["youtube@peacebestill.fyi"] }).then((r) => r.value);
  report.addon = (await client.send("Addon:Install", { path: SRC, temporary: true })).value;
  const running = await client.send("WebDriver:ExecuteAsyncScript", { script: `const done = arguments[arguments.length - 1];
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    AddonManager.getAddonsByTypes(["extension"]).then((all) => done(all.filter((a) => !a.isSystem && !a.isBuiltin && a.isActive)
      .map((a) => ({ id: a.id, temporary: a.temporarilyInstalled, root: a.getResourceURI().spec }))));` }).then((r) => r.value);
  report.running = running;
  const srcRoot = pathToFileURL(SRC + "/").href;
  if (running.length !== 1 || running[0].id !== "youtube@peacebestill.fyi" || !running[0].temporary || running[0].root !== srcRoot) {
    throw new Error(`expected only this checkout's src/ running, got ${JSON.stringify(running)}`);
  }

  // Switching an extension off can take the tab it had open with it -- the
  // containers extension does -- and every command after that fails with
  // "Browsing context has been discarded". So carry on in a tab of our own,
  // opened from the browser itself, since the tab Marionette was driving may
  // be the one that went.
  await client.script('gBrowser.selectedTab = gBrowser.addTrustedTab("about:blank"); return true;');
  await client.send("Marionette:SetContext", { value: "content" });
  const handles = await client.send("WebDriver:GetWindowHandles").then((r) => r.value ?? r);
  await client.send("WebDriver:SwitchToWindow", { handle: handles[handles.length - 1] });

  await client.send("Marionette:SetContext", { value: "chrome" });
  const uuids = JSON.parse(await client.script('return Services.prefs.getStringPref("extensions.webextensions.uuids");'));
  await client.send("Marionette:SetContext", { value: "content" });
  const uuid = uuids["youtube@peacebestill.fyi"];
  report.optionsUuid = uuid ?? null;
  if (!uuid) throw new Error("the add-on has no internal UUID yet");

  // Two tabs, as the Chromium audit has: the options page in one, since writing
  // settings means being on the extension's own origin, and YouTube in the
  // other. With one tab those alternated, and every pass reloaded the watch
  // page -- four loads of YouTube for what one does, since a setting reaches an
  // open tab over storage.onChanged exactly as it does for a real user.
  const watchTab = (await client.send("WebDriver:GetWindowHandle")).value;
  const optionsTab = (await client.send("WebDriver:NewWindow", { type: "tab" })).handle;
  await client.send("WebDriver:SwitchToWindow", { handle: optionsTab });
  await client.send("WebDriver:Navigate", { url: `moz-extension://${uuid}/options.html` });
  await sleep(600);

  async function write(settings) {
    await client.send("WebDriver:SwitchToWindow", { handle: optionsTab });
    const result = await client.asyncScript(`
      const done = arguments[arguments.length - 1];
      const w = window.wrappedJSObject ?? window;
      const api = w.browser ?? (typeof browser !== "undefined" ? browser : null);
      if (!api) return done("no browser API in this realm");
      const value = JSON.parse(arguments[0]);
      api.storage.sync.set(typeof cloneInto === "function" ? cloneInto(value, w) : value).then(() => done("ok"), (e) => done(String(e)));`,
      [JSON.stringify(settings)]);
    await client.send("WebDriver:SwitchToWindow", { handle: watchTab });
    await sleep(1500); // long enough for the open page to hear the change and re-apply
    return result;
  }

  // The one load of YouTube in this audit.
  async function openWatchPage() {
    await client.send("WebDriver:SwitchToWindow", { handle: watchTab });
    await beforeLoad("youtube");
    await client.send("WebDriver:Navigate", { url: VIDEO });
    const rendered = await waitForWatch(client);
    await sleep(3000);
    await openGuide(client);
    return rendered;
  }

  report.optionsBoxes = await client.script('return [...document.querySelectorAll("input[type=checkbox]")].map((b) => `${b.name}=${b.checked}`);');

  // Pass one: every child switch on, parents off, so each child has a visible
  // container to act inside.
  report.storageWrite = await write(CHILDREN_PASS);
  report.watchRendered = await openWatchPage();
  const notYouTube = whyNotYouTube((await client.send("WebDriver:GetCurrentURL")).value, "www.youtube.com");
  if (notYouTube) throw new Error(notYouTube);
  if (!report.watchRendered) throw new Error("the watch page never rendered, so nothing could be measured");
  report.children = await client.script(SURVEY, [SELECTORS]);
  report.titleCalm = await client.asyncScript(`
    const done = arguments[arguments.length - 1];
    const el = arguments[0].map((sel) => document.querySelector(sel)).find(Boolean);
    if (!el) return done("no title element found");
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    if (!node) return done("no text node");
    node.nodeValue = arguments[1];
    setTimeout(() => done(node.nodeValue), 700);`, [TITLE_PROBES, SHOUTING]);
  writeFileSync(OUT + "youtube-firefox-children.png", Buffer.from((await client.send("WebDriver:TakeScreenshot", { full: false })).value, "base64"));

  // The dislike count needs the buttons row it attaches to, so it belongs here.
  for (let i = 0; i < 40 && !report.dislikes; i++) {
    await sleep(500);
    report.dislikes = await client.script('return document.querySelector(".peacebestill-dislikes")?.textContent || null;');
  }

  // The middle layer, its grandparents still off.
  await write(MIDDLE_PASS);
  report.middle = await client.script(SURVEY, [SELECTORS]);

  // Pass two: the parents as well.
  await write(EVERYTHING);
  // Still the watch page: nothing navigates it now, and hiding what is on it
  // must not have taken the page itself away.
  report.watchRenderedAgain = await client.script('return !!document.querySelector("ytd-watch-flexy");');
  report.parents = await client.script(SURVEY, [SELECTORS]);
  report.adBlockerBait = await client.script(AD_BLOCKER_BAIT);

  // And switching one back off must bring its target back.
  await write({ relatedVideos: false });
  report.afterToggle = await client.script(SURVEY, [SELECTORS]);
  writeFileSync(OUT + "youtube-firefox-after-toggle.png", Buffer.from((await client.send("WebDriver:TakeScreenshot", { full: false })).value, "base64"));
  await client.send("Marionette:Quit", {}).catch(() => {});
} catch (e) {
  report.error = String(e.stack || e);
} finally {
  firefox.kill("SIGTERM");
  await sleep(1500);
  rmSync(profile, { recursive: true, force: true });
}
// Title calming is script, not stylesheet, so no survey sees it: judged here.
report.titleCalmed = report.titleCalm === calmTitle(SHOUTING);
if (!report.titleCalmed) console.error(`title not calmed: got ${JSON.stringify(report.titleCalm)}`);
writeFileSync(OUT + "firefox-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const bait = baitProblem(report.adBlockerBait);
if (bait) console.error(bait);
process.exitCode = report.error || !report.titleCalmed || bait ? 1 : 0;
