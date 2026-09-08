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
      if (child.type === "checkbox") out.push({ box: child, row: label, node });
      walk(child, child.tag === "label" ? child : label);
    }
  };
  walk(root, null);
  return out.map(({ box, row }) => ({
    name: box.name,
    box,
    row,
    checked: box.checked === true,
    indented: !!row?.classList.contains("child"),
    moot: !!row?.classList.contains("moot"),
    ariaDisabled: box.getAttribute("aria-disabled"),
    reallyDisabled: box.disabled === true,
    note: (row?.children ?? []).filter((c) => c.tag === "span").map((c) => c.textContent).join(""),
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

test("blackout is the parent of everything, but nothing is indented under it", async () => {
  const { rows } = await render();
  // Nesting is only drawn when parent and child share a section. Blackout has
  // a section to itself, so every other switch stays at the top level of its
  // own group -- which is the point: they are ordinary switches that happen to
  // be pointless while the site is gone.
  assert.deepEqual(rows().map((r) => r.indented), [false, false, false, false, false]);
  assert.deepEqual(rows().map((r) => r.name), [
    "blackout", "homeToMessaging", "homeToNotifications", "homeToJobs", "notificationCount",
  ]);
});

test("with the site blacked out every other switch says so, stays reachable by keyboard, and cannot be changed", async () => {
  const { rows, change, writes, removes } = await render({ blackout: true });
  for (const key of ["homeToMessaging", "homeToNotifications", "homeToJobs", "notificationCount"]) {
    const row = rows().find((r) => r.name === key);
    assert.equal(row.moot, true, key);
    assert.equal(row.ariaDisabled, "true", `${key} is announced as disabled`);
    assert.equal(row.reallyDisabled, false, `${key} must stay in the tab order`);
    // Not indented under blackout, so the note has to name it.
    assert.match(row.note, /Replace LinkedIn with a better idea/, `${key} names what locked it`);
  }
  assert.equal(rows().find((r) => r.name === "blackout").moot, false);

  // Clicking a locked one changes nothing.
  await change("homeToJobs", true);
  assert.deepEqual(plain(writes), []);
  assert.deepEqual(plain(removes), []);
  assert.equal(rows().find((r) => r.name === "homeToJobs").checked, false, "the tick is put back");
});

test("only a switch that differs from its default is stored", async () => {
  const { change, writes, removes } = await render();
  await change("homeToJobs", true);
  assert.deepEqual(plain(writes), [{ homeToJobs: true }]);
  await change("homeToJobs", false);
  assert.deepEqual(plain(writes), [{ homeToJobs: true }], "nothing more written");
  assert.deepEqual(plain(removes), ["homeToJobs"]);
});

test("settings already stored that match their default are cleaned up on load", async () => {
  const { removes } = await render({ homeToJobs: false, blackout: true });
  assert.deepEqual(plain(removes), [["homeToJobs"]], "blackout differs, so it stays");
});

test("the summary counts what is on, and turning everything off clears the lot", async () => {
  const { byId, rows, removes } = await render({ blackout: true, homeToJobs: true });
  assert.match(byId.summary.textContent, /2 of 5/);

  await byId["all-off"].listeners.click();
  assert.deepEqual(plain(removes.at(-1)), ["blackout", "homeToJobs"], "every stored key is dropped");
  assert.equal(rows().every((r) => !r.checked), true);
  assert.match(byId.summary.textContent, /0 of 5/);
});

test("the filter narrows the list to matching switches", async () => {
  const { byId, rows } = await render();
  byId.filter.value = "messaging";
  await byId.filter.listeners.input();
  assert.deepEqual(rows().filter((r) => !r.hidden).map((r) => r.name), ["homeToMessaging"]);

  byId.filter.value = "";
  await byId.filter.listeners.input();
  assert.equal(rows().filter((r) => r.hidden).length, 0, "clearing the filter shows everything again");
});

test("a storage failure is reported rather than silently pretended", async () => {
  const { byId, change } = await render({}, { failWrites: true });
  await change("blackout", true);
  assert.match(byId.status.textContent, /could not be saved/i);
});
