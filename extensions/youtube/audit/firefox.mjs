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
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
  `user_pref("marionette.port", ${PORT});`,
  "",
].join("\n"));
// --remote-allow-system-access lets the audit read the add-on's internal UUID.
const firefox = spawn(FIREFOX, ["--marionette", "--remote-allow-system-access", "--headless", "--no-remote", "--new-instance", "--profile", profile, "about:blank"], { stdio: "ignore" });

// Keep in step with src/hide.css: read it. Every "display: none" rule gated
// on a feature key contributes its selector (the gate stripped off).
const { KEYS, FEATURES } = await (async () => {
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
  report.addon = (await client.send("Addon:Install", { path: SRC, temporary: true })).value;
  // An enterprise policy installs its extensions into every profile, this
  // throwaway one included, and a content blocker hiding an ad would pass for
  // one of our switches working. Switch every other extension off first.
  await client.send("Marionette:SetContext", { value: "chrome" });
  report.otherExtensionsDisabled = await client.send("WebDriver:ExecuteAsyncScript", { script: `const done = arguments[arguments.length - 1];
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    (async () => {
      const others = (await AddonManager.getAddonsByTypes(["extension"])).filter((a) => a.id !== arguments[0] && !a.isSystem && !a.isBuiltin && a.isActive);
      for (const a of others) await a.disable();
      done(others.map((a) => a.id));
    })().catch((e) => done("ERROR " + e));`, args: ["youtube@peacebestill.fyi"] }).then((r) => r.value);
  await client.send("Marionette:SetContext", { value: "content" });

  await client.send("Marionette:SetContext", { value: "chrome" });
  const uuids = JSON.parse(await client.script('return Services.prefs.getStringPref("extensions.webextensions.uuids");'));
  await client.send("Marionette:SetContext", { value: "content" });
  const uuid = uuids["youtube@peacebestill.fyi"];
  report.optionsUuid = uuid ?? null;
  if (!uuid) throw new Error("the add-on has no internal UUID yet");

  // Writing settings means being on the extension's own origin.
  async function write(settings) {
    await client.send("WebDriver:Navigate", { url: `moz-extension://${uuid}/options.html` });
    await sleep(600);
    return client.asyncScript(`
      const done = arguments[arguments.length - 1];
      const w = window.wrappedJSObject ?? window;
      const api = w.browser ?? (typeof browser !== "undefined" ? browser : null);
      if (!api) return done("no browser API in this realm");
      const value = JSON.parse(arguments[0]);
      api.storage.sync.set(typeof cloneInto === "function" ? cloneInto(value, w) : value).then(() => done("ok"), (e) => done(String(e)));`,
      [JSON.stringify(settings)]);
  }

  async function onWatchPage() {
    await client.send("WebDriver:Navigate", { url: VIDEO });
    const rendered = await waitForWatch(client);
    await sleep(3000);
    await openGuide(client);
    return rendered;
  }

  await client.send("WebDriver:Navigate", { url: `moz-extension://${uuid}/options.html` });
  await sleep(600);
  report.optionsBoxes = await client.script('return [...document.querySelectorAll("input[type=checkbox]")].map((b) => `${b.name}=${b.checked}`);');

  // Pass one: every child switch on, parents off, so each child has a visible
  // container to act inside.
  report.storageWrite = await write(CHILDREN_PASS);
  report.watchRendered = await onWatchPage();
  report.children = await client.script(SURVEY, [SELECTORS]);
  writeFileSync(OUT + "youtube-firefox-children.png", Buffer.from((await client.send("WebDriver:TakeScreenshot", { full: false })).value, "base64"));

  // The dislike count needs the buttons row it attaches to, so it belongs here.
  for (let i = 0; i < 40 && !report.dislikes; i++) {
    await sleep(500);
    report.dislikes = await client.script('return document.querySelector(".peacebestill-dislikes")?.textContent || null;');
  }

  // The middle layer, its grandparents still off.
  await write(MIDDLE_PASS);
  await onWatchPage();
  report.middle = await client.script(SURVEY, [SELECTORS]);

  // Pass two: the parents as well.
  await write(EVERYTHING);
  report.watchRenderedAgain = await onWatchPage();
  report.parents = await client.script(SURVEY, [SELECTORS]);

  // And switching one back off must bring its target back.
  await write({ relatedVideos: false });
  await onWatchPage();
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
writeFileSync(OUT + "firefox-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.error ? 1 : 0;
