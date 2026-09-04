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
const profile = mkdtempSync(join(tmpdir(), "yt-tidy-audit-"));
writeFileSync(join(profile, "user.js"), [
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("browser.startup.page", 0);',
  'user_pref("browser.startup.homepage", "about:blank");',
  'user_pref("browser.aboutwelcome.enabled", false);',
  'user_pref("app.update.enabled", false);',
  `user_pref("marionette.port", ${PORT});`,
  "",
].join("\n"));
// --remote-allow-system-access lets the audit read the add-on's internal UUID.
const firefox = spawn(FIREFOX, ["--marionette", "--remote-allow-system-access", "--headless", "--no-remote", "--new-instance", "--profile", profile, "about:blank"], { stdio: "ignore" });

// Keep in step with src/tidy.css: read it. Every "display: none" rule gated
// on a feature key contributes its selector (the gate stripped off).
const SELECTORS = {};
for (const m of readFileSync(new URL("../src/tidy.css", import.meta.url), "utf8").matchAll(/html\[data-yt-tidy~="([^"]+)"\]\s*([^{]+?)\s*\{\s*display: none !important;\s*\}/g)) {
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

  await client.send("WebDriver:Navigate", { url: VIDEO });
  report.watchRendered = await waitForWatch(client);
  await sleep(3000);
  report.watch = await client.script(SURVEY, [SELECTORS]);
  await openGuide(client);
  report.withGuide = await client.script(SURVEY, [SELECTORS]);
  writeFileSync(OUT + "firefox-watch.png", Buffer.from((await client.send("WebDriver:TakeScreenshot", { full: false })).value, "base64"));

  await client.send("Marionette:SetContext", { value: "chrome" });
  const uuids = JSON.parse(await client.script('return Services.prefs.getStringPref("extensions.webextensions.uuids");'));
  await client.send("Marionette:SetContext", { value: "content" });
  const uuid = uuids["youtube-tidy@peacebestill.fyi"];
  if (uuid) {
    await client.send("WebDriver:Navigate", { url: `moz-extension://${uuid}/options.html` });
    await sleep(800);
    report.optionsBoxes = await client.script('return [...document.querySelectorAll("input[type=checkbox]")].map((b) => `${b.name}=${b.checked}`);');
    report.storageWrite = await client.asyncScript(`
      const done = arguments[arguments.length - 1];
      const w = window.wrappedJSObject ?? window;
      const api = w.browser ?? (typeof browser !== "undefined" ? browser : null);
      if (!api) return done("no browser API in this realm");
      const value = { footer: false, dislikeCount: true };
      api.storage.sync.set(typeof cloneInto === "function" ? cloneInto(value, w) : value).then(() => done("ok"), (e) => done(String(e)));`);
    await client.send("WebDriver:Navigate", { url: VIDEO });
    report.watchRenderedAgain = await waitForWatch(client);
    await sleep(3000);
    await openGuide(client);
    report.afterToggle = await client.script(SURVEY, [SELECTORS]);
    for (let i = 0; i < 40 && !report.dislikes; i++) {
      await sleep(500);
      report.dislikes = await client.script('return document.querySelector(".yt-tidy-dislikes")?.textContent || null;');
    }
    writeFileSync(OUT + "firefox-after-toggle.png", Buffer.from((await client.send("WebDriver:TakeScreenshot", { full: false })).value, "base64"));
  }
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
