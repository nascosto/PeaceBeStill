import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic } from "./helpers/load-classic.mjs";

// options.js runs in another vm realm, so objects it creates have foreign
// prototypes; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

test("options.html loads tidy-core.js before options.js and has the form", () => {
  const html = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  assert.ok(html.indexOf('src="tidy-core.js"') < html.indexOf('src="options.js"'));
  assert.match(html, /<form id="features">/);
});

// A fake DOM just big enough for options.js. The form records every checkbox
// appended to it, directly or inside a label row.
function fakeDocument() {
  const form = {
    elements: [],
    listeners: {},
    append(...nodes) {
      this.elements.push(...nodes.flatMap((n) => n.children ?? [n]).filter((n) => n.type === "checkbox"));
    },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
  const document = {
    getElementById: (id) => (id === "features" ? form : null),
    createElement: (tag) => ({ tag, children: [], append(...n) { this.children.push(...n); } }),
    createTextNode: (text) => ({ text }),
  };
  return { document, form };
}

test("options.js builds one checkbox per feature and reflects stored settings over defaults", async () => {
  const { YtTidy } = loadClassic("src/tidy-core.js");
  const { document, form } = fakeDocument();
  const writes = [];
  const chrome = { storage: { sync: { get: async () => ({ create: false }), set: async (obj) => writes.push(obj) } } };
  loadClassic("src/options.js", { YtTidy, document, chrome });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(form.elements.map((e) => e.name), [...YtTidy.KEYS]);
  const box = (name) => form.elements.find((e) => e.name === name);
  assert.equal(box("create").checked, false, "stored value wins");
  assert.equal(box("footer").checked, true, "default on");
  assert.equal(box("dislikeCount").checked, false, "default off");

  await form.listeners.change({ target: { name: "footer", checked: false } });
  assert.deepEqual(plain(writes), [{ footer: false }]);
});

test("ticking the dislike count asks Firefox for the optional data-collection permission first", async () => {
  const { YtTidy } = loadClassic("src/tidy-core.js");
  const { document, form } = fakeDocument();
  const writes = [];
  const requests = [];
  let answer = true;
  const browser = {
    storage: { sync: { get: async () => ({}), set: async (obj) => writes.push(obj) } },
    permissions: { request: async (req) => { requests.push(req); return answer; } },
  };
  loadClassic("src/options.js", { YtTidy, document, browser });
  await new Promise((resolve) => setTimeout(resolve, 0));

  await form.listeners.change({ target: { name: "dislikeCount", checked: true } });
  assert.deepEqual(plain(requests), [{ data_collection: ["browsingActivity"] }]);
  assert.deepEqual(plain(writes), [{ dislikeCount: true }]);

  answer = false;
  const refused = { name: "dislikeCount", checked: true };
  await form.listeners.change({ target: refused });
  assert.equal(refused.checked, false, "declined: the box unticks");
  assert.deepEqual(plain(writes), [{ dislikeCount: true }], "declined: nothing written");

  await form.listeners.change({ target: { name: "dislikeCount", checked: false } });
  assert.equal(requests.length, 2, "unticking asks nothing");
  assert.deepEqual(plain(writes.at(-1)), { dislikeCount: false });
});
