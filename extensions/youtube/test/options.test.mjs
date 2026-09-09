import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

// options.js runs in another vm realm, so objects it creates have foreign
// prototypes; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

test("options.html is a real document: language, a heading, and core.js before options.js", () => {
  const html = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<h1[^>]*>/);
  assert.ok(html.indexOf('src="core.js"') < html.indexOf('src="options.js"'));
  for (const id of ["features", "filter", "summary", "all-off", "status"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

// A fake DOM just big enough for options.js.
function fakeDocument() {
  const element = (tag) => {
    const node = {
      tag, children: [], attrs: {}, textContent: "", value: "", hidden: false, listeners: {},
      classList: {
        names: new Set(),
        add(n) { this.names.add(n); },
        toggle(n, on) { on ? this.names.add(n) : this.names.delete(n); },
        contains(n) { return this.names.has(n); },
      },
      append(...nodes) { this.children.push(...nodes); },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      removeAttribute(k) { delete this.attrs[k]; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
    };
    return node;
  };
  const byId = {};
  for (const id of ["features", "filter", "summary", "all-off", "status"]) byId[id] = element(id === "features" ? "form" : "div");
  const document = {
    byId,
    getElementById: (id) => byId[id] ?? null,
    createElement: element,
    createTextNode: (text) => ({ tag: "#text", text, children: [] }),
  };
  return { document, byId };
}

// Every checkbox in the tree, with the label row that holds it.
function rowsOf(root) {
  const out = [];
  const walk = (node, label) => {
    for (const child of node.children ?? []) {
      if (child.type === "checkbox" || child.tag === "select") out.push({ box: child, row: label, node });
      walk(child, child.tag === "label" ? child : label);
    }
  };
  walk(root, null);
  return out.map(({ box, row }) => ({
    name: box.name,
    box,
    row,
    checked: box.checked === true,
    value: box.value,
    isSelect: box.tag === "select",
    depth: Number(row?.getAttribute("data-depth") ?? 0),
    indented: Number(row?.getAttribute("data-depth") ?? 0) > 0,
    ariaDisabled: box.getAttribute("aria-disabled"),
    reallyDisabled: box.disabled === true,
    hidden: row?.hidden === true,
  }));
}

async function render(stored = {}, { failWrites = false } = {}) {
  const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));
  const { document, byId } = fakeDocument();
  const writes = [];
  const removes = [];
  const reject = () => Promise.reject(new Error("quota"));
  const chrome = { storage: { sync: {
    get: async () => stored,
    set: failWrites ? reject : async (obj) => { writes.push(obj); },
    remove: failWrites ? reject : async (keys) => { removes.push(keys); },
  } } };
  loadClassic(new URL("../src/options.js", import.meta.url), { PeaceBeStill, document, chrome });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const change = async (name, checked) => {
    const row = rowsOf(byId.features).find((r) => r.name === name);
    row.box.checked = checked;
    await byId.features.listeners.change({ target: row.box });
  };
  return { PeaceBeStill, byId, writes, removes, change, rows: () => rowsOf(byId.features) };
}

test("every feature gets one checkbox, inside a fieldset with its section as the legend", async () => {
  const { PeaceBeStill, byId, rows } = await render();
  assert.deepEqual(rows().map((r) => r.name).sort(), [...PeaceBeStill.KEYS].sort());
  const fieldsets = byId.features.children.filter((c) => c.tag === "fieldset");
  assert.deepEqual(
    fieldsets.map((f) => f.children.find((c) => c.tag === "legend").textContent),
    [...PeaceBeStill.GROUPS],
  );
});

test("a child is indented directly under its parent when they share a section", async () => {
  const { rows } = await render();
  const order = rows().map((r) => r.name);
  const at = (name) => order.indexOf(name);
  for (const [parent, children] of [
    ["header", ["create", "notifications"]],
    ["description", ["expandDescription", "descriptionChannelLinks", "descriptionCards", "descriptionChips", "summary"]],
    ["relatedVideos", ["recommended", "liveChat", "playlistPanel"]],
    ["comments", ["profilePhotos"]],
    ["buttonsBar", ["dislikeCount"]],
    ["subscriptions", ["subscriptionDots"]],
  ]) {
    assert.deepEqual(order.slice(at(parent) + 1, at(parent) + 1 + children.length), children, parent);
    for (const child of children) assert.equal(rows()[at(child)].indented, true, child);
    assert.equal(rows()[at(parent)].indented, false, parent);
  }
});

test("a switch its parent covers is taken off the list, not explained away", async () => {
  const { rows, change, writes, removes } = await render({ header: true, comments: true, relatedVideos: true });
  for (const key of ["create", "notifications", "profilePhotos", "liveChat", "recommended", "playlistPanel"]) {
    assert.equal(rows().find((r) => r.name === key).hidden, true, key);
  }
  // The switches that did the covering are still there to turn back off.
  for (const key of ["header", "comments", "relatedVideos"]) {
    assert.equal(rows().find((r) => r.name === key).hidden, false, key);
  }
  // Cross-section: hiding Subscriptions strands the home redirect.
  const stranded = await render({ subscriptions: true });
  assert.equal(stranded.rows().find((r) => r.name === "homeToSubscriptions").hidden, true);

  // A covered switch refuses a change, since it cannot be clicked anyway.
  await change("liveChat", true);
  assert.deepEqual(plain(writes), []);
  assert.deepEqual(plain(removes), []);
  assert.equal(rows().find((r) => r.name === "liveChat").checked, false, "the tick is put back");
});

test("only a switch that differs from its default is stored", async () => {
  const { change, writes, removes } = await render();
  await change("footer", true);
  assert.deepEqual(plain(writes), [{ footer: true }]);
  await change("footer", false);
  assert.deepEqual(plain(writes), [{ footer: true }], "nothing more written");
  assert.deepEqual(plain(removes), ["footer"]);
});

test("settings already stored that match their default are cleaned up on load", async () => {
  const { removes } = await render({ footer: false, create: true, dislikeCount: false });
  assert.deepEqual(plain(removes), [["footer", "dislikeCount"]], "create differs, so it stays");
});

test("the summary counts what is on, and turning everything off clears the lot", async () => {
  const { byId, rows, removes } = await render({ footer: true, create: true });
  assert.match(byId.summary.textContent, /2 of 43/);

  await byId["all-off"].listeners.click();
  assert.deepEqual(plain(removes.at(-1)), ["footer", "create"], "every stored key is dropped");
  assert.equal(rows().every((r) => !r.checked), true);
  assert.match(byId.summary.textContent, /0 of 43/);
});

test("the filter narrows the list to matching switches", async () => {
  const { byId, rows } = await render();
  byId.filter.value = "dislike";
  await byId.filter.listeners.input();
  const shown = rows().filter((r) => !r.hidden).map((r) => r.name);
  assert.deepEqual(shown, ["dislikeCount"]);

  byId.filter.value = "";
  await byId.filter.listeners.input();
  assert.equal(rows().filter((r) => r.hidden).length, 0, "clearing the filter shows everything again");
});

test("a storage failure is reported rather than silently pretended", async () => {
  const { byId, change } = await render({}, { failWrites: true });
  await change("footer", true);
  assert.match(byId.status.textContent, /could not be saved/i);
});

test("ticking the dislike count asks Firefox for the optional data-collection permission first", async () => {
  const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));
  const { document, byId } = fakeDocument();
  const writes = [];
  const removes = [];
  const requests = [];
  let answer = true;
  const browser = {
    storage: { sync: { get: async () => ({}), set: async (o) => { writes.push(o); }, remove: async (k) => { removes.push(k); } } },
    permissions: { request: async (req) => { requests.push(req); return answer; } },
  };
  loadClassic(new URL("../src/options.js", import.meta.url), { PeaceBeStill, document, browser });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const change = async (name, checked) => {
    const row = rowsOf(byId.features).find((r) => r.name === name);
    row.box.checked = checked;
    await byId.features.listeners.change({ target: row.box });
  };

  await change("dislikeCount", true);
  assert.deepEqual(plain(requests), [{ data_collection: ["browsingActivity"] }]);
  assert.deepEqual(plain(writes), [{ dislikeCount: true }]);

  answer = false;
  await change("dislikeCount", true);
  assert.equal(rowsOf(byId.features).find((r) => r.name === "dislikeCount").checked, false, "declined: the box unticks");
  assert.deepEqual(plain(writes), [{ dislikeCount: true }], "declined: nothing written");

  await change("dislikeCount", false);
  assert.equal(requests.length, 2, "unticking asks nothing");
  assert.deepEqual(plain(removes.at(-1)), "dislikeCount");
});

test("a browser without the data-collection permission API still stores the choice", async () => {
  const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));
  const { document, byId } = fakeDocument();
  const writes = [];
  // Chromium: permissions.request exists but rejects an unknown key.
  const chrome = {
    storage: { sync: { get: async () => ({}), set: async (o) => { writes.push(o); }, remove: async () => {} } },
    permissions: { request: async () => { throw new TypeError("Unexpected property: 'data_collection'"); } },
  };
  loadClassic(new URL("../src/options.js", import.meta.url), { PeaceBeStill, document, chrome });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const row = rowsOf(byId.features).find((r) => r.name === "dislikeCount");
  row.box.checked = true;
  await byId.features.listeners.change({ target: row.box });
  assert.deepEqual(plain(writes), [{ dislikeCount: true }]);
});
