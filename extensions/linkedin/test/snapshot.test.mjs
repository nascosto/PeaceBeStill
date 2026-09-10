import test from "node:test";
import assert from "node:assert/strict";
import { snapshot } from "../audit/snapshot.mjs";

// The reading is written here and run over there, so it travels as text. It
// used to travel inside a template literal, which drops a lone backslash: the
// regex splitting the mark attribute arrived as /s+/ and split on the letter s,
// so "sponsored" was filed as "ponsored" and "suggested" as "ugge"/"ted". Every
// kind with an s in its name -- most of them -- silently read as unmarked, and
// the audit called working switches "no confirmed effect". These tests run the
// function the way the page gets it: through String().
function fakeDom(elements, { shadow = null, title = "Feed | LinkedIn" } = {}) {
  const visible = (e) => (e.visible === false ? [] : [{}]);
  for (const e of elements) {
    e.getClientRects = () => visible(e);
    e.getAttribute = (name) => e.attrs?.[name] ?? null;
    e.children = e.children || [];
    e.parentElement = e.parentElement || null;
    e.closest = () => null;
  }
  const host = shadow ? { shadowRoot: { querySelectorAll: () => shadow } } : null;
  if (shadow) for (const e of shadow) e.getClientRects = () => visible(e);
  return {
    title,
    documentElement: { getAttribute: () => "sponsored" },
    querySelector: () => host,
    querySelectorAll: (selector) =>
      selector === "[data-pbs]" ? elements.filter((e) => e.attrs && e.attrs["data-pbs"]) : [],
  };
}

function readWith(document, elements) {
  const asThePageGetsIt = new Function(`return (${String(snapshot)})`)();
  const saved = { document: globalThis.document, location: globalThis.location };
  globalThis.document = document;
  globalThis.location = { pathname: "/feed/" };
  try {
    return asThePageGetsIt({}, {}, { "messaging overlay": "aside" });
  } finally {
    globalThis.document = saved.document;
    globalThis.location = saved.location;
    void elements;
  }
}

test("a mark is filed under its own name, s and all", () => {
  const elements = [{ attrs: { "data-pbs": "sponsored" }, visible: false }];
  const out = readWith(fakeDom(elements), elements);
  assert.deepEqual(Object.keys(out.marks), ["sponsored"], "the kind was filed under the wrong name");
  assert.deepEqual(out.marks.sponsored, { found: 1, showing: 0 });
});

test("an element carrying two kinds counts under both", () => {
  const elements = [{ attrs: { "data-pbs": "suggested composer" } }];
  const out = readWith(fakeDom(elements), elements);
  assert.deepEqual(Object.keys(out.marks).sort(), ["composer", "suggested"]);
  assert.equal(out.marks.suggested.showing, 1, "a mark still on screen was counted as hidden");
});

// The overlays live in a shadow root, and document.querySelectorAll cannot see
// into one. The audit reported "nothing on this page to hide" for the chat
// bubble and the AI assistant on every page -- not because they were absent,
// but because it had no way to look. These are the two switches that had
// already been reported broken by hand, so being blind to them was expensive.
test("an overlay inside a shadow root is counted, not missed", () => {
  const elements = [];
  const overlay = [{ visible: true }];
  const out = readWith(fakeDom(elements, { shadow: overlay }), elements);
  assert.equal(out.probes["messaging overlay"], 1, "the shadow root was not looked into");
});

test("an overlay that has been hidden reads as gone", () => {
  const elements = [];
  const overlay = [{ visible: false }];
  const out = readWith(fakeDom(elements, { shadow: overlay }), elements);
  assert.equal(out.probes["messaging overlay"], 0);
});

test("a page with no shadow root at all is not an error", () => {
  const elements = [];
  const out = readWith(fakeDom(elements), elements);
  assert.equal(out.probes["messaging overlay"], 0);
});

// The unread count is in the tab title, which is not on the page at all.
test("the unread count in the tab title is seen, and its absence too", () => {
  const elements = [];
  const withCount = readWith(fakeDom(elements, { title: "(3) Feed | LinkedIn" }), elements);
  assert.equal(withCount.probes["unread count in the title"], 1);
  assert.equal(withCount.title, "(3) Feed | LinkedIn");

  const without = readWith(fakeDom(elements, { title: "Feed | LinkedIn" }), elements);
  assert.equal(without.probes["unread count in the title"], 0);
});
