import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "./helpers/load-classic.mjs";

const PAGE = new URL("../shared/page.js", import.meta.url);

function store({ blocked = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => { if (blocked) throw new Error("blocked"); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (blocked) throw new Error("blocked"); map.set(k, String(v)); },
    removeItem: (k) => { if (blocked) throw new Error("blocked"); map.delete(k); },
  };
}

test("remember keeps a value, and removes its key once the value is empty", () => {
  const localStorage = store();
  const { PeaceBeStillPage: page } = loadClassic(PAGE, { localStorage });
  page.remember("peacebestill.tokens", "shorts ads");
  assert.equal(page.recall("peacebestill.tokens"), "shorts ads");
  // The site's scripts can read this store and it outlives the extension, so
  // nothing switched on must mean nothing kept.
  page.remember("peacebestill.tokens", "");
  assert.equal(localStorage.map.has("peacebestill.tokens"), false);
  page.remember("peacebestill.goes", null);
  assert.equal(localStorage.map.size, 0);
});

test("blocked site storage is a missing memory, never an error", () => {
  const { PeaceBeStillPage: page } = loadClassic(PAGE, { localStorage: store({ blocked: true }) });
  assert.equal(page.recall("x"), null);
  assert.doesNotThrow(() => page.remember("x", "y"));
  assert.doesNotThrow(() => page.remember("x", ""));
});

test("listen hands over what storage holds, then every change, and a removal falls back", async () => {
  const seen = [];
  let onChanged;
  const api = { storage: { sync: { get: async () => ({ a: true }) }, onChanged: { addListener: (fn) => { onChanged = fn; } } } };
  const { PeaceBeStillPage: page } = loadClassic(PAGE);
  page.listen(api, ["a", "b"], (stored) => seen.push(JSON.stringify(stored)));
  await new Promise((r) => setTimeout(r, 0));
  onChanged({ b: { newValue: true } }, "sync");
  onChanged({ a: {} }, "sync");
  onChanged({ c: { newValue: true } }, "local"); // another area is not ours
  assert.deepEqual(seen, ['{"a":true}', '{"a":true,"b":true}', '{"b":true}']);
});

test("storage that cannot be read is the defaults, not a page left untouched", async () => {
  const seen = [];
  const api = { storage: { sync: { get: async () => { throw new Error("no"); } }, onChanged: { addListener() {} } } };
  const { PeaceBeStillPage: page } = loadClassic(PAGE);
  page.listen(api, [], (stored) => seen.push(stored));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen.length, 1);
  assert.deepEqual({ ...seen[0] }, {});
});

test("watchMutations runs the immediate work in the observer's turn and the settled work once, afterwards", async () => {
  let fire;
  class MutationObserver { constructor(fn) { fire = fn; } observe() { this.on = true; } disconnect() { fire = null; } }
  const calls = [];
  const document = { documentElement: {} };
  const { PeaceBeStillPage: page } = loadClassic(PAGE, { MutationObserver, document, setTimeout, clearTimeout });
  const watcher = page.watchMutations({ immediate: () => calls.push("now"), settled: () => calls.push("settled"), settleMs: 5 });
  watcher.start();
  watcher.start(); // a second start is a no-op, not a second observer
  fire(); fire(); fire();
  assert.deepEqual(calls, ["now", "now", "now"]);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls, ["now", "now", "now", "settled"], "settled work waits for quiet, and runs once");
  watcher.stop();
  assert.equal(fire, null);
});

test("followLogo sends a logo click where home would go, and leaves every other click alone", () => {
  let onClick;
  const went = [];
  const document = { addEventListener: (type, fn, capture) => { if (type === "click" && capture) onClick = fn; } };
  const location = { assign: (url) => went.push(url) };
  const { PeaceBeStillPage: page } = loadClassic(PAGE, { document, location });
  let destination = "/feed/subscriptions";
  page.followLogo((el) => el.isLogo === true, () => destination);
  page.followLogo(() => true, () => "/elsewhere"); // registering twice does not add a second listener

  const click = (target) => {
    const event = { target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    onClick(event);
    return event;
  };
  const logo = { isLogo: true, closest: () => null };
  const other = { isLogo: false, closest: () => null };

  const e1 = click(logo);
  assert.equal(e1.prevented && e1.stopped, true);
  assert.deepEqual(went, ["/feed/subscriptions"]);
  assert.equal(click(other).prevented, false);
  destination = null; // no redirect in force: the logo does what the site says
  assert.equal(click(logo).prevented, false);
  assert.deepEqual(went, ["/feed/subscriptions"]);
});

// The first read of storage is asked for as the page loads. A change can land
// while it is still out -- a switch flipped in another tab at that moment -- and
// the read may come back with what storage held before it. Laid over the top,
// that older answer would undo the change until the next one.
test("a change that arrives before the first read answers is not undone by that read", async () => {
  const seen = [];
  let onChanged;
  let answer;
  const api = { storage: {
    sync: { get: () => new Promise((resolve) => { answer = resolve; }) },
    onChanged: { addListener: (fn) => { onChanged = fn; } },
  } };
  const { PeaceBeStillPage: page } = loadClassic(PAGE);
  page.listen(api, ["shorts", "comments"], (stored) => seen.push(JSON.stringify(stored)));
  onChanged({ shorts: { newValue: true } }, "sync"); // turned on while the read is out
  onChanged({ comments: {} }, "sync");               // and this one removed
  answer({ comments: true });                       // the read, taken before either
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen.at(-1), '{"shorts":true}', "the older read won");
});
