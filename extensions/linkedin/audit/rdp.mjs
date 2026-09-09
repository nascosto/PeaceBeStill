// A tiny client for Firefox's Remote Debugging Protocol, which is the channel
// devtools itself uses -- not WebDriver, so it sets no navigator.webdriver flag
// on a signed-in session.
//
// LinkedIn is behind a login, so the signed-out headless audits that keep the
// YouTube extension honest cannot run here. This drives the dev profile you
// have already signed into (npm run dev:linkedin) so selectors can be checked
// against real pages, and pages can be navigated without clicking.
//
// Nothing it reads is ever written to this repository: a signed-in LinkedIn
// page carries real names and profile identifiers, and this repo is public.
//
// Framing is "<byte length>:<json>", the same as Marionette's.
import net from "node:net";
import { execSync } from "node:child_process";
export function devPort() {
  const m = execSync("ps -eo args").toString().match(/-start-debugger-server (\d+)/);
  if (!m) throw new Error("no dev Firefox running");
  return Number(m[1]);
}

export class RDP {
  constructor(socket) {
    this.socket = socket; this.buffer = Buffer.alloc(0);
    this.waiters = []; this.events = [];
    socket.on("data", (d) => this.onData(d));
  }
  static connect(port = 43201) {
    return new Promise((resolve, reject) => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => resolve(new RDP(s)));
      s.once("error", reject);
    });
  }
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const colon = this.buffer.indexOf(0x3a);
      if (colon === -1) return;
      const len = Number(this.buffer.subarray(0, colon).toString("ascii"));
      if (!Number.isFinite(len)) return;
      if (this.buffer.length < colon + 1 + len) return;
      const msg = JSON.parse(this.buffer.subarray(colon + 1, colon + 1 + len).toString("utf8"));
      this.buffer = this.buffer.subarray(colon + 1 + len);
      const i = this.waiters.findIndex((w) => w.match(msg));
      if (i !== -1) this.waiters.splice(i, 1)[0].resolve(msg);
      else this.events.push(msg);
    }
  }
  await(match, ms = 15000) {
    const found = this.events.findIndex(match);
    if (found !== -1) return Promise.resolve(this.events.splice(found, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { match, resolve };
      this.waiters.push(w);
      setTimeout(() => { const i = this.waiters.indexOf(w); if (i !== -1) { this.waiters.splice(i, 1); reject(new Error("RDP timeout")); } }, ms);
    });
  }
  send(packet) {
    const body = Buffer.from(JSON.stringify(packet), "utf8");
    this.socket.write(Buffer.concat([Buffer.from(`${body.length}:`, "ascii"), body]));
  }
  async request(packet, match) {
    const p = this.await(match ?? ((m) => m.from === packet.to));
    this.send(packet);
    return p;
  }
  close() { this.socket.end(); }
}

// Connect, find the LinkedIn tab, return a function that evaluates JS in it.
export async function linkedInTab(port = devPort()) {
  const rdp = await RDP.connect(port);
  await rdp.await((m) => m.from === "root");
  const { tabs } = await rdp.request({ to: "root", type: "listTabs" }, (m) => Array.isArray(m.tabs));
  const tab = tabs.find((t) => /linkedin\.com/.test(t.url ?? "")) ?? tabs[0];
  if (!tab) throw new Error("no tabs");
  let target = await rdp.request({ to: tab.actor, type: "getTarget" }, (m) => !!m.frame);
  let consoleActor = target.frame.consoleActor;
  const reacquire = async () => {
    const { tabs } = await rdp.request({ to: "root", type: "listTabs" }, (m) => Array.isArray(m.tabs));
    const t = tabs.find((x) => /linkedin\.com/.test(x.url ?? "")) ?? tabs[0];
    target = await rdp.request({ to: t.actor, type: "getTarget" }, (m) => !!m.frame);
    consoleActor = target.frame.consoleActor;
  };
  const evaluate = async (text) => {
    const res = await rdp.request(
      { to: consoleActor, type: "evaluateJSAsync", text, mapped: { await: true } },
      (m) => m.type === "evaluationResult" || m.error,
    );
    if (res.error === "noSuchActor") { await reacquire(); return evaluate(text); }
    if (res.error) throw new Error(`${res.error}: ${res.message}`);
    if (res.exception) throw new Error("page threw: " + JSON.stringify(res.exceptionMessage ?? res.exception));
    const v = res.result;
    return v && typeof v === "object" && "value" in v ? v.value : v;
  };
  const goTo = async (url) => {
    const actor = target.frame.actor;
    await rdp.request({ to: actor, type: "navigateTo", url }, (m) => m.from === actor || m.error);
    await reacquire().catch(() => {});
    const want = new URL(url).pathname;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const at = await evaluate("document.readyState + '|' + location.pathname + '|' + document.body.innerText.length");
        if (typeof at !== "string") continue;
        const [state, path, len] = at.split("|");
        if (state === "complete" && path === want && Number(len) > 400) return path;
      } catch {}
    }
    return null;
  };
  return { rdp, tab, evaluate, goTo, close: () => rdp.close() };
}
