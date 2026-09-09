import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

// content.js is the wiring: it reads storage, writes the attribute the
// stylesheet gates on, and marks what CSS cannot select. It had no test, and a
// function deleted by an edit turned the whole extension inert while every
// other test stayed green -- the failure was swallowed by a catch. So this
// runs the real file against a fake DOM and asserts the attribute arrives.
function fakeWorld({ stored = {}, failStorage = false, pathname = "/feed/", title = "Feed | LinkedIn" } = {}) {
  const root = {
    dataset: {},
    getAttribute: () => null,
    setAttribute() {},
    querySelectorAll: () => [],
  };
  const listeners = {};
  const document = {
    documentElement: root,
    title,
    body: { children: [] },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { listeners[type] = fn; },
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, append() {} }),
  };
  const changed = [];
  const api = {
    storage: {
      sync: {
        get: async () => { if (failStorage) throw new Error("storage unavailable"); return stored; },
      },
      onChanged: { addListener(fn) { changed.push(fn); } },
    },
  };
  const replaced = [];
  const location = { pathname, search: "", replace: (url) => replaced.push(url) };
  class MutationObserver {
    constructor(fn) { this.fn = fn; }
    observe() { this.observing = true; }
    disconnect() { this.observing = false; }
  }
  return { root, document, api, location, MutationObserver, changed, replaced, listeners };
}

async function run(options) {
  const world = fakeWorld(options);
  const context = loadClassic(new URL("../src/core.js", import.meta.url));
  loadClassic(new URL("../src/content.js", import.meta.url), {
    PeaceBeStill: context.PeaceBeStill,
    browser: world.api,
    document: world.document,
    location: world.location,
    MutationObserver: world.MutationObserver,
    setTimeout, clearTimeout,
  });
  // Let the storage promise settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return world;
}

test("a fresh install applies the defaults: the attribute is set, and empty", async () => {
  const world = await run();
  // The regression this exists for: an exception in the wiring left the
  // attribute never set at all, which reads as "extension not installed".
  assert.notEqual(world.root.dataset.peacebestill, undefined, "the attribute was never set");
  assert.equal(world.root.dataset.peacebestill, "");
});

test("a stored switch reaches the attribute", async () => {
  const world = await run({ stored: { sponsored: true } });
  assert.equal(world.root.dataset.peacebestill, "sponsored");
});

test("blackout wins: everything it makes moot is dropped from the attribute", async () => {
  const world = await run({ stored: { blackout: true, sponsored: true, games: true } });
  assert.equal(world.root.dataset.peacebestill, "blackout");
});

test("storage being unavailable still applies the defaults rather than doing nothing", async () => {
  const world = await run({ failStorage: true });
  assert.equal(world.root.dataset.peacebestill, "", "a storage failure must not leave the page unmarked");
});

test("a change in storage reaches an open tab without a reload", async () => {
  const world = await run();
  assert.equal(world.changed.length, 1, "content.js must listen for storage changes");
  world.changed[0]({ suggested: { newValue: true } }, "sync");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(world.root.dataset.peacebestill, "suggested");
  // A removal arrives with no newValue and must fall back to the default.
  world.changed[0]({ suggested: {} }, "sync");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(world.root.dataset.peacebestill, "");
});

test("a redirect switch sends the home page onward, and only from the home page", async () => {
  const home = await run({ stored: { homeToMessaging: true }, pathname: "/feed/" });
  assert.deepEqual([...home.replaced], ["/messaging/"]);
  const elsewhere = await run({ stored: { homeToMessaging: true }, pathname: "/jobs/" });
  assert.deepEqual([...elsewhere.replaced], []);
});

test("the tab title says the blackout sentence, and loses the unread count", async () => {
  const black = await run({ stored: { blackout: true }, title: "(3) Feed | LinkedIn" });
  assert.equal(black.document.title, "You made the right choice.");
  const counted = await run({ stored: { notificationCount: true }, title: "(3) Feed | LinkedIn" });
  assert.equal(counted.document.title, "Feed | LinkedIn");
});
