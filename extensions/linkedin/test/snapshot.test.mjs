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
function fakeDom(elements) {
  const visible = (e) => (e.visible === false ? [] : [{}]);
  for (const e of elements) {
    e.getClientRects = () => visible(e);
    e.getAttribute = (name) => e.attrs?.[name] ?? null;
    e.children = e.children || [];
    e.parentElement = e.parentElement || null;
    e.closest = () => null;
  }
  return {
    documentElement: { getAttribute: () => "sponsored" },
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
    return asThePageGetsIt({}, {});
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
