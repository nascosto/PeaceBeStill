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

// A fake DOM just big enough for options.js: the form records what is appended,
// and elements carry the few properties the page sets.
function fakeDocument() {
  const element = (tag) => ({
    tag,
    children: [],
    textContent: "",
    classList: {
      names: new Set(),
      toggle(name, on) { on ? this.names.add(name) : this.names.delete(name); },
      contains(name) { return this.names.has(name); },
    },
    append(...nodes) { this.children.push(...nodes); },
  });
  const form = {
    appended: [],
    listeners: {},
    append(...nodes) { this.appended.push(...nodes); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    get elements() { return this.appended.flatMap((n) => n.children ?? []).filter((n) => n.type === "checkbox"); },
    get rows() {
      return this.appended
        .filter((n) => n.children.some((c) => c.type === "checkbox"))
        .map((n) => ({
          name: n.children.find((c) => c.type === "checkbox").name,
          indented: n.classList.contains("child"),
          moot: n.classList.contains("moot"),
          disabled: n.children.find((c) => c.type === "checkbox").disabled === true,
          note: n.children.filter((c) => c.tag === "span").map((c) => c.textContent).join(""),
        }));
    },
  };
  const document = {
    getElementById: (id) => (id === "features" ? form : null),
    createElement: element,
    createTextNode: (text) => ({ text }),
  };
  return { document, form };
}

async function render(stored = {}) {
  const { YtTidy } = loadClassic("src/tidy-core.js");
  const { document, form } = fakeDocument();
  const writes = [];
  const removes = [];
  const chrome = { storage: { sync: {
    get: async () => stored,
    set: async (obj) => writes.push(obj),
    remove: async (keys) => removes.push(keys),
  } } };
  loadClassic("src/options.js", { YtTidy, document, chrome });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { YtTidy, form, writes, removes };
}

test("every feature gets exactly one checkbox, grouped under its section heading", async () => {
  const { YtTidy, form } = await render();
  assert.deepEqual(form.rows.map((r) => r.name).sort(), [...YtTidy.KEYS].sort());
  assert.deepEqual(form.appended.filter((n) => n.tag === "h2").map((n) => n.textContent), [...YtTidy.GROUPS]);
});

test("a child is indented directly under its parent when they share a section", async () => {
  const { form } = await render();
  const order = form.rows.map((r) => r.name);
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
    for (const child of children) assert.equal(form.rows[at(child)].indented, true, child);
    assert.equal(form.rows[at(parent)].indented, false, parent);
  }
});

test("a child whose parent is in another section stays at the top level there", async () => {
  const { form } = await render();
  for (const key of ["homeToSubscriptions", "upcoming"]) {
    assert.equal(form.rows.find((r) => r.name === key).indented, false, key);
  }
});

test("a switch its parent has made pointless is greyed out and cannot be changed", async () => {
  const on = await render({ header: true, comments: true });
  for (const key of ["create", "notifications", "profilePhotos"]) {
    const row = on.form.rows.find((r) => r.name === key);
    assert.equal(row.moot, true, key);
    assert.equal(row.disabled, true, key);
  }
  // Its own stored value is untouched, so turning the parent off restores it.
  assert.equal(on.form.rows.find((r) => r.name === "create").note, "", "the parent is the switch above; no note needed");
  const strandedNote = on.form.rows.find((r) => r.name === "homeToSubscriptions").note;
  assert.equal(strandedNote, "", "subscriptions is off, so this one is fine");

  const off = await render({ header: false, comments: false });
  for (const key of ["create", "notifications", "profilePhotos"]) {
    assert.equal(off.form.rows.find((r) => r.name === key).disabled, false, key);
  }
});

test("a switch stranded by a parent in another section says which one", async () => {
  const { form } = await render({ subscriptions: true });
  const row = form.rows.find((r) => r.name === "homeToSubscriptions");
  assert.equal(row.moot, true);
  assert.equal(row.disabled, true);
  assert.match(row.note, /Hide Subscriptions/);
});

test("checkboxes reflect stored settings over defaults", async () => {
  const { form } = await render({ create: true });
  const row = (name) => form.elements.find((e) => e.name === name);
  assert.equal(row("create").checked, true, "stored value wins");
  assert.equal(row("footer").checked, false, "everything is off by default");
  assert.equal(row("dislikeCount").checked, false, "off by default");
});

test("a change is written to storage, and the greying is recomputed at once", async () => {
  const { form, writes } = await render();
  await form.listeners.change({ target: { name: "footer", checked: true } });
  assert.deepEqual(plain(writes), [{ footer: true }]);

  // Switching a parent on greys its children without waiting for a reload.
  assert.equal(form.rows.find((r) => r.name === "profilePhotos").disabled, false);
  await form.listeners.change({ target: { name: "comments", checked: true } });
  assert.equal(form.rows.find((r) => r.name === "profilePhotos").disabled, true);
});

test("only a switch that differs from its default is stored", async () => {
  const { form, writes, removes } = await render();

  // Everything is off by default, so switching footer on is worth storing.
  await form.listeners.change({ target: { name: "footer", checked: true } });
  assert.deepEqual(plain(writes), [{ footer: true }]);
  assert.deepEqual(plain(removes), []);

  // Switching it back off returns it to the default, so drop the key entirely
  // rather than storing something the defaults already say.
  await form.listeners.change({ target: { name: "footer", checked: false } });
  assert.deepEqual(plain(writes), [{ footer: true }], "nothing more written");
  assert.deepEqual(plain(removes), ["footer"]);
});

test("settings already stored that match their default are cleaned up on load", async () => {
  const { removes } = await render({ footer: false, create: true, dislikeCount: false });
  assert.deepEqual(plain(removes), [["footer", "dislikeCount"]], "create differs, so it stays");
});

test("nothing is removed when there is nothing redundant", async () => {
  const { removes } = await render({ create: true });
  assert.deepEqual(plain(removes), []);
});

test("ticking the dislike count asks Firefox for the optional data-collection permission first", async () => {
  const { YtTidy } = loadClassic("src/tidy-core.js");
  const { document, form } = fakeDocument();
  const writes = [];
  const requests = [];
  let answer = true;
  const removes = [];
  const browser = {
    storage: { sync: { get: async () => ({}), set: async (obj) => writes.push(obj), remove: async (k) => removes.push(k) } },
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
  // Off is this switch's default, so unticking drops the key rather than storing false.
  assert.deepEqual(plain(writes), [{ dislikeCount: true }]);
  assert.deepEqual(plain(removes), ["dislikeCount"]);
});
