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
    // LinkedIn keeps its overlays in a shadow root; with no host there is
    // nothing to style, which is the case a fake DOM stands in for.
    getElementById: () => null,
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
  const location = { pathname, search: "", replace: (url) => replaced.push(url),
    assign: (url) => replaced.push(url) };
  class MutationObserver {
    constructor(fn) { this.fn = fn; }
    observe() { this.observing = true; }
    disconnect() { this.observing = false; }
  }
  // The path is polled rather than watched, so the test drives the clock: tick()
  // is one turn of that poll, with no real timer involved.
  const ticks = [];
  const setInterval = (fn) => { ticks.push(fn); return ticks.length; };
  const clearInterval = (id) => { if (id) ticks[id - 1] = null; };
  const tick = () => ticks.forEach((fn) => fn && fn());
  return { root, document, api, location, MutationObserver, changed, replaced, listeners, setInterval, clearInterval, tick, ticks };
}

function fakeStore(map, blocked = false) {
  return {
    getItem: (key) => { if (blocked) throw new Error("blocked"); return map.has(key) ? map.get(key) : null; },
    setItem: (key, value) => { if (blocked) throw new Error("blocked"); map.set(key, String(value)); },
  };
}

async function run(options) {
  const world = fakeWorld(options);
  world.remembered = new Map(Object.entries(options?.remembered ?? {}));
  const context = loadClassic(new URL("../src/core.js", import.meta.url));
  loadClassic(new URL("../src/content.js", import.meta.url), {
    PeaceBeStill: context.PeaceBeStill,
    browser: world.api,
    document: world.document,
    location: world.location,
    MutationObserver: world.MutationObserver,
    setTimeout, clearTimeout,
    setInterval: world.setInterval, clearInterval: world.clearInterval,
    localStorage: fakeStore(world.remembered),
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
  const home = await run({ stored: { homeRedirect: "messaging" }, pathname: "/feed/" });
  assert.deepEqual([...home.replaced], ["/messaging/"]);
  const elsewhere = await run({ stored: { homeRedirect: "messaging" }, pathname: "/jobs/" });
  assert.deepEqual([...elsewhere.replaced], []);
});

test("the tab title says the blackout sentence, and loses the unread count", async () => {
  const black = await run({ stored: { blackout: true }, title: "(3) Feed | LinkedIn" });
  assert.equal(black.document.title, "You made the right choice.");
  const counted = await run({ stored: { notificationCount: true }, title: "(3) Feed | LinkedIn" });
  assert.equal(counted.document.title, "Feed | LinkedIn");
});

// LinkedIn is a single-page app: the top bar changes the URL without a load.
// Nothing re-read it, so a page taken out of the top bar stayed reachable by
// clicking through to it, and every rule went on applying to whichever page
// happened to load first.
test("a page hidden from the top bar cannot be reached by navigating to it", async () => {
  const world = await run({ stored: { homeRedirect: "jobs", jobs: false }, pathname: "/mynetwork/" });
  assert.deepEqual(world.replaced, [], "nothing to redirect: we did not start on the home page");

  world.location.pathname = "/feed/";
  world.tick();
  assert.deepEqual(world.replaced, ["/jobs/"], "navigating to the home page did not send us onward");
});

test("the page a rule applies to follows the URL, rather than the page that loaded", async () => {
  const world = await run({ stored: { myNetwork: true }, pathname: "/feed/" });
  assert.equal(world.root.dataset.pbsPage, "home");

  world.location.pathname = "/mynetwork/grow/";
  world.tick();
  assert.equal(world.root.dataset.pbsPage, "myNetwork", "the page was still the one we loaded on");
});

test("with everything off, nothing is left polling the URL", async () => {
  const world = await run();
  assert.deepEqual(world.ticks.filter(Boolean), [], "a poll was left running with no switch on");
});

// storage.sync answers a moment after the page starts drawing. Until it does,
// nothing is hidden -- so on every load the things you asked to be rid of were
// there to see first. What was applied last time is kept where it can be read
// without waiting, and put on the page before it is first painted.
test("the last tokens are on the page before storage has answered", async () => {
  const world = fakeWorld({ stored: { games: true } });
  const store = new Map([["peacebestill.tokens", "sponsored games"]]);
  const context = loadClassic(new URL("../src/core.js", import.meta.url));
  loadClassic(new URL("../src/content.js", import.meta.url), {
    PeaceBeStill: context.PeaceBeStill,
    browser: world.api,
    document: world.document,
    location: world.location,
    MutationObserver: world.MutationObserver,
    setTimeout, clearTimeout,
    setInterval: world.setInterval, clearInterval: world.clearInterval,
    localStorage: fakeStore(store),
  });
  // Synchronously, before the storage promise has had a turn.
  assert.equal(world.root.dataset.peacebestill, "sponsored games",
    "the page was left unhidden until storage answered");

  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(world.root.dataset.peacebestill, "games", "what storage says has to win");
  assert.equal(store.get("peacebestill.tokens"), "games", "and is remembered for next time");
});

test("a page that will not keep anything still works", async () => {
  const world = fakeWorld({ stored: { games: true } });
  const context = loadClassic(new URL("../src/core.js", import.meta.url));
  loadClassic(new URL("../src/content.js", import.meta.url), {
    PeaceBeStill: context.PeaceBeStill,
    browser: world.api,
    document: world.document,
    location: world.location,
    MutationObserver: world.MutationObserver,
    setTimeout, clearTimeout,
    setInterval: world.setInterval, clearInterval: world.clearInterval,
    localStorage: fakeStore(new Map(), true),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(world.root.dataset.peacebestill, "games");
});

// The logo goes home, and home may be a page you have asked never to see.
test("the logo goes where the home page goes", async () => {
  // Away from the home page, or the redirect happens before anything is clicked.
  const world = await run({ stored: { home: true, homeRedirect: "profile" }, pathname: "/messaging/" });
  const onClick = world.listeners.click;
  assert.ok(onClick, "nothing is listening for a click on the logo");

  const logo = { querySelector: (sel) => (/LinkedIn/.test(sel) ? {} : null) };
  const event = { target: { closest: () => logo }, preventDefault() { this.prevented = true; },
                  stopPropagation() { this.stopped = true; } };
  onClick(event);
  assert.equal(event.prevented, true, "the site's own handler still ran");
  assert.deepEqual(world.replaced, ["/in/me/"], "the logo did not go to the chosen page");
});

test("a click that is not the logo is left alone", async () => {
  const world = await run({ stored: { home: true, homeRedirect: "profile" }, pathname: "/messaging/" });
  const notLogo = { querySelector: () => null };
  const event = { target: { closest: () => notLogo }, preventDefault() { this.prevented = true; },
                  stopPropagation() {} };
  world.listeners.click(event);
  assert.equal(event.prevented, undefined);
  assert.deepEqual(world.replaced, []);
});
