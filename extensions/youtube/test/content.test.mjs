import test from "node:test";
import assert from "node:assert/strict";
import { loadCore, loadContent } from "../../../test/helpers/load-classic.mjs";

// content.js is the wiring: it reads storage, writes the attribute the
// stylesheet gates on, redirects, and acts on the player. It had no test of its
// own -- the logo, the embedded-player frames and autoplay were covered only by
// live runs -- so this runs the real file against a fake page.
const SRC = new URL("../src/", import.meta.url);
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

function fakeWorld({ stored = {}, failStorage = false, pathname = "/", search = "", title = "YouTube", frame = null, remembered = {}, elements = {} } = {}) {
  const root = { dataset: {} };
  const listeners = {};
  const document = {
    documentElement: root,
    title,
    // Selectors the tests care about answer with whatever the test put there.
    querySelectorAll: (sel) => elements[sel] || [],
    querySelector: (sel) => (elements[sel] || [])[0] || null,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    createElement: () => ({ className: "", style: {}, textContent: "" }),
  };
  const window = { addEventListener() {} };
  window.top = frame ? {} : window;
  const replaced = [];
  const location = { pathname: frame || pathname, search, replace: (url) => replaced.push(url), assign: (url) => replaced.push(url) };
  const changed = [];
  const api = {
    storage: {
      sync: { get: async () => { if (failStorage) throw new Error("storage unavailable"); return stored; } },
      onChanged: { addListener(fn) { changed.push(fn); } },
    },
  };
  const store = new Map(Object.entries(remembered));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const fetched = [];
  const fetch = async (url) => { fetched.push(String(url)); return { ok: true, json: async () => ({ dislikes: 1200 }) }; };
  class MutationObserver { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} }
  return { root, document, window, location, api, listeners, replaced, changed, store, localStorage, fetched, fetch, MutationObserver };
}

async function run(options) {
  const world = fakeWorld(options);
  const { PeaceBeStill } = loadCore(SRC);
  loadContent(SRC, {
    PeaceBeStill,
    browser: world.api,
    document: world.document,
    window: world.window,
    location: world.location,
    localStorage: world.localStorage,
    fetch: world.fetch,
    MutationObserver: world.MutationObserver,
    NodeFilter: { SHOW_TEXT: 4 },
    setTimeout, clearTimeout,
  });
  await settle();
  return world;
}

test("a fresh install applies the defaults: the attribute is set, and empty", async () => {
  const world = await run();
  assert.equal(world.root.dataset.peacebestill, "");
});

test("a stored switch reaches the attribute, and a switch its parent covers does not", async () => {
  assert.equal((await run({ stored: { shorts: true } })).root.dataset.peacebestill, "shorts");
  assert.equal((await run({ stored: { videoDetails: true, videoInfo: true } })).root.dataset.peacebestill, "videoDetails");
});

test("storage being unavailable still applies the defaults rather than doing nothing", async () => {
  assert.equal((await run({ failStorage: true })).root.dataset.peacebestill, "");
});

test("a change in storage reaches an open tab, and a removal falls back to the default", async () => {
  const world = await run({ pathname: "/watch" });
  world.changed[0]({ comments: { newValue: true } }, "sync");
  assert.equal(world.root.dataset.peacebestill, "comments");
  world.changed[0]({ comments: {} }, "sync");
  assert.equal(world.root.dataset.peacebestill, "");
});

test("pages go where their switches send them", async () => {
  assert.deepEqual((await run({ stored: { homeToSubscriptions: true }, pathname: "/" })).replaced, ["/feed/subscriptions"]);
  assert.deepEqual((await run({ stored: { subscriptions: true }, pathname: "/feed/subscriptions" })).replaced, ["/"]);
  assert.deepEqual((await run({ stored: { shorts: true }, pathname: "/shorts/abcdef12345" })).replaced, ["/watch?v=abcdef12345"]);
  assert.deepEqual((await run({ stored: { channelTabRedirect: true }, pathname: "/@someone/posts" })).replaced, ["/@someone"]);
  assert.deepEqual((await run({ stored: {}, pathname: "/" })).replaced, []);
});

test("in a player embedded on another site it applies the switches but never navigates the page", async () => {
  const world = await run({ stored: { endScreenFeed: true, homeToSubscriptions: true }, frame: "/embed/abcdef12345" });
  assert.equal(world.root.dataset.peacebestill, "homeToSubscriptions endScreenFeed");
  assert.deepEqual(world.replaced, []);
  assert.equal(world.store.size, 0, "nothing is remembered from inside someone else's page");
});

test("in any other YouTube frame -- live chat, say -- it does nothing at all", async () => {
  const world = await run({ stored: { comments: true }, frame: "/live_chat" });
  assert.equal(world.root.dataset.peacebestill, undefined);
  assert.equal(world.changed.length, 0, "not even listening");
});

test("the last tokens are on the page, and act, before storage has answered", async () => {
  const world = fakeWorld({ stored: { shorts: true }, remembered: { "peacebestill.tokens": "comments shorts" }, pathname: "/results" });
  const { PeaceBeStill } = loadCore(SRC);
  loadContent(SRC, { PeaceBeStill, browser: world.api, document: world.document, window: world.window, location: world.location,
    localStorage: world.localStorage, fetch: world.fetch, MutationObserver: world.MutationObserver, setTimeout, clearTimeout });
  assert.equal(world.root.dataset.peacebestill, "shorts comments", "the page was left unhidden until storage answered");
  await settle();
  assert.equal(world.root.dataset.peacebestill, "shorts", "what storage says has to win");
  assert.equal(world.store.get("peacebestill.tokens"), "shorts", "and is remembered for next time");
});

test("with everything off, nothing is left in the site's storage", async () => {
  const world = await run({ stored: {}, remembered: { "peacebestill.tokens": "shorts" }, pathname: "/results" });
  assert.equal(world.store.size, 0);
});

// A switch remembered from last time may have been turned off since, on this
// device or another. Hiding on a guess costs a moment; asking a third party
// about a video on a guess is a privacy cost, so the early pass never does.
test("remembered settings never ask the dislike service anything; only storage can", async () => {
  const button = { querySelector: () => null, append() {}, classList: [], style: {}, getClientRects: () => [1] };
  const elements = { "dislike-button-view-model button": [button] };
  const off = await run({ stored: {}, remembered: { "peacebestill.tokens": "dislikeCount" }, pathname: "/watch", search: "?v=abcdef12345", elements });
  assert.deepEqual(off.fetched, [], "a stale remembered switch made a request");
  const on = await run({ stored: { dislikeCount: true }, pathname: "/watch", search: "?v=abcdef12345", elements });
  assert.equal(on.fetched.length, 1);
  assert.match(on.fetched[0], /returnyoutubedislikeapi\.com\/votes\?videoId=abcdef12345$/);
});

test("the logo goes where the home page would, on the desktop and on a phone", async () => {
  const world = await run({ stored: { homeToSubscriptions: true }, pathname: "/watch" });
  const [onClick] = world.listeners.click || [];
  assert.ok(onClick, "nothing is listening for a click on the logo");
  for (const tag of ["a#logo", "ytm-home-logo"]) {
    const event = { target: { closest: (sel) => (sel.includes(tag) ? {} : null) }, preventDefault() { this.prevented = true; }, stopPropagation() {} };
    onClick(event);
    assert.equal(event.prevented, true, `${tag}: the site's own handler still ran`);
  }
  assert.deepEqual(world.replaced, ["/feed/subscriptions", "/feed/subscriptions"]);

  const elsewhere = { target: { closest: () => null }, preventDefault() { this.prevented = true; }, stopPropagation() {} };
  onClick(elsewhere);
  assert.equal(elsewhere.prevented, undefined, "a click that is not the logo is left alone");
});

test("the unread count leaves the tab title", async () => {
  const world = await run({ stored: { notifications: true }, pathname: "/watch", title: "(3) A video - YouTube" });
  assert.equal(world.document.title, "A video - YouTube");
});

test("autoplay is switched off on the desktop player and the phone's", async () => {
  // Each player's toggle says it is on its own way: aria-checked on the
  // desktop, aria-pressed on a phone. The script asks for whichever is on --
  // hidden or not, since hide.css hides the toggle -- and clicks it once.
  const asked = [];
  let clicked = 0;
  const toggle = { click: () => { clicked++; }, getClientRects: () => [] };
  const world = fakeWorld({ stored: { autoplay: true }, pathname: "/watch" });
  world.document.querySelectorAll = (sel) => {
    asked.push(sel);
    return /autonav-toggle/.test(sel) ? [toggle] : [];
  };
  const { PeaceBeStill } = loadCore(SRC);
  loadContent(SRC, { PeaceBeStill, browser: world.api, document: world.document, window: world.window, location: world.location,
    localStorage: world.localStorage, fetch: world.fetch, MutationObserver: world.MutationObserver, setTimeout, clearTimeout });
  await settle();
  const query = asked.find((sel) => /autonav-toggle/.test(sel));
  assert.ok(query, "nothing looked for the autoplay toggle");
  assert.match(query, /\.ytp-autonav-toggle-button\[aria-checked="true"\]/, "the desktop toggle");
  assert.match(query, /\.ytm-autonav-toggle-button-container\[aria-pressed="true"\]/, "the phone's toggle");
  assert.equal(clicked, 1);
});
