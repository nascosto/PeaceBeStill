import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic, loadCore } from "../../../test/helpers/load-classic.mjs";

// options.js runs in another vm realm, so objects it creates have foreign
// prototypes; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

test("options.html is a real document: language, a heading, and settings.js, core.js, options.js in that order", () => {
  const html = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<h1[^>]*>/);
  assert.ok(html.indexOf('src="settings.js"') < html.indexOf('src="core.js"'));
  assert.ok(html.indexOf('src="core.js"') < html.indexOf('src="options.js"'));
  for (const id of ["features", "filter", "summary", "clear-all", "disable", "disable-for", "disabled", "status"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

// options.js takes the disable key from page.js, which options.html loads first.
const { PeaceBeStillPage } = loadClassic(new URL("../src/page.js", import.meta.url));

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
      replaceChildren(...nodes) { this.children = [...nodes]; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      removeAttribute(k) { delete this.attrs[k]; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
    };
    return node;
  };
  const byId = {};
  for (const id of ["features", "filter", "summary", "clear-all", "disable", "disable-for", "disabled", "status"]) byId[id] = element(id === "features" ? "form" : "div");
  const document = {
    byId,
    documentElement: element("html"),
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
    depth: Number(row?.getAttribute("data-depth") ?? 0),
    ariaDisabled: box.getAttribute("aria-disabled"),
    reallyDisabled: box.disabled === true,
    hidden: row?.hidden === true,
  }));
}

async function render(stored = {}, { failWrites = false, search = "", screenWidth = 1920 } = {}) {
  const { PeaceBeStill } = loadCore(new URL("../src/", import.meta.url));
  const { document, byId } = fakeDocument();
  const writes = [];
  const removes = [];
  const reject = () => Promise.reject(new Error("quota"));
  const chrome = { storage: { sync: {
    get: async () => stored,
    set: failWrites ? reject : async (obj) => { writes.push(obj); },
    remove: failWrites ? reject : async (keys) => { removes.push(keys); },
  } } };
  loadClassic(new URL("../src/options.js", import.meta.url), { PeaceBeStill, PeaceBeStillPage, setTimeout, clearTimeout, document, chrome, location: { search }, screen: { width: screenWidth } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const change = async (name, checked) => {
    const row = rowsOf(byId.features).find((r) => r.name === name);
    row.box.checked = checked;
    await byId.features.listeners.change({ target: row.box });
  };
  return { PeaceBeStill, document, byId, writes, removes, change, rows: () => rowsOf(byId.features) };
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
    ["description", ["expandDescription", "descriptionChannelLinks", "descriptionCards", "descriptionChips", "summary"]],
    ["relatedVideos", ["recommended", "liveChat"]],
    ["comments", ["profilePhotos"]],
    ["buttonsBar", ["dislikeCount"]],
    ["subscriptions", ["subscriptionDots"]],
  ]) {
    assert.deepEqual(order.slice(at(parent) + 1, at(parent) + 1 + children.length), children, parent);
    for (const child of children) {
      assert.equal(rows()[at(child)].indented, true, child);
      assert.equal(rows()[at(child)].depth, rows()[at(parent)].depth + 1, `${child} sits one level under ${parent}`);
    }
  }
  // Two levels: the block under the video holds four switches, two of which
  // hold switches of their own. Each direct child comes after the parent and
  // before the next row back out at the parent's own depth.
  const top = at("videoDetails");
  const end = order.findIndex((_, i) => i > top && rows()[i].depth <= rows()[top].depth);
  for (const child of ["videoInfo", "buttonsBar", "channelRow", "description"]) {
    assert.ok(at(child) > top && (end === -1 || at(child) < end), `${child} is inside videoDetails`);
    assert.equal(rows()[at(child)].depth, rows()[top].depth + 1, child);
  }
  assert.equal(rows()[at("dislikeCount")].depth, rows()[top].depth + 2, "a grandchild is two levels in");
});

test("a switch its parent covers is taken off the list, not explained away", async () => {
  const { rows, change, writes, removes } = await render({ header: true, comments: true, relatedVideos: true });
  for (const key of ["profilePhotos", "liveChat", "recommended"]) {
    assert.equal(rows().find((r) => r.name === key).hidden, true, key);
  }
  // The switches that did the covering are still there to turn back off. So
  // are Create and the notifications switch with the top bar hidden: it does
  // not cover them.
  for (const key of ["header", "comments", "relatedVideos", "create", "notifications"]) {
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

test("the summary counts what is on, and clearing all, on a second click, clears the lot", async () => {
  const { byId, rows, removes } = await render({ footer: true, create: true });
  assert.match(byId.summary.textContent, /2 of 46/);

  await byId["clear-all"].listeners.click();
  assert.equal(removes.length, 0, "one click only asks to be sure");
  await byId["clear-all"].listeners.click();
  assert.deepEqual(plain(removes.at(-1)), ["footer", "create"], "every stored key is dropped");
  assert.equal(rows().every((r) => !r.checked), true);
  assert.match(byId.summary.textContent, /0 of 46/);
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
  const { PeaceBeStill } = loadCore(new URL("../src/", import.meta.url));
  const { document, byId } = fakeDocument();
  const writes = [];
  const removes = [];
  const requests = [];
  let answer = true;
  const browser = {
    storage: { sync: { get: async () => ({}), set: async (o) => { writes.push(o); }, remove: async (k) => { removes.push(k); } } },
    permissions: { request: async (req) => { requests.push(req); return answer; } },
  };
  loadClassic(new URL("../src/options.js", import.meta.url), { PeaceBeStill, PeaceBeStillPage, setTimeout, clearTimeout, document, browser });
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
  const { PeaceBeStill } = loadCore(new URL("../src/", import.meta.url));
  const { document, byId } = fakeDocument();
  const writes = [];
  // Chromium: permissions.request exists but rejects an unknown key.
  const chrome = {
    storage: { sync: { get: async () => ({}), set: async (o) => { writes.push(o); }, remove: async () => {} } },
    permissions: { request: async () => { throw new TypeError("Unexpected property: 'data_collection'"); } },
  };
  loadClassic(new URL("../src/options.js", import.meta.url), { PeaceBeStill, PeaceBeStillPage, setTimeout, clearTimeout, document, chrome });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const row = rowsOf(byId.features).find((r) => r.name === "dislikeCount");
  row.box.checked = true;
  await byId.features.listeners.change({ target: row.box });
  assert.deepEqual(plain(writes), [{ dislikeCount: true }]);
});

// The toolbar button opens this same page as its popup, as options.html?popup.
// A popup is sized to its content, so the page gives itself a width there --
// but not on a phone, where Firefox for Android opens the "popup" as a tab
// and a fixed width would overflow the screen.
test("opened from the toolbar button the page takes a popup's width, except on a phone", async () => {
  const popup = await render({}, { search: "?popup", screenWidth: 1920 });
  assert.equal(popup.document.documentElement.classList.contains("popup"), true);
  assert.equal((await render({}, { search: "", screenWidth: 1920 })).document.documentElement.classList.contains("popup"), false, "the add-ons manager's copy");
  assert.equal((await render({}, { search: "?popup", screenWidth: 412 })).document.documentElement.classList.contains("popup"), false, "a phone");
  assert.equal(popup.rows().length, popup.PeaceBeStill.KEYS.length, "the popup is the whole options page, not a cut-down one");
});

// A permission prompt can outlive the popup that asked for it, losing the
// answer. So the popup asks nothing: a switch that needs a permission not yet
// granted opens the full options page, which asks, and the popup closes.
test("in the toolbar popup, a switch needing a permission not yet granted hands over to the options page", async () => {
  const run = async (granted) => {
    const { PeaceBeStill } = loadCore(new URL("../src/", import.meta.url));
    const { document, byId } = fakeDocument();
    const calls = { writes: [], requests: [], opened: 0, closed: 0 };
    const browser = {
      storage: { sync: { get: async () => ({}), set: async (o) => { calls.writes.push(o); }, remove: async () => {} } },
      permissions: {
        contains: async () => { if (granted === "throws") throw new TypeError("Unexpected property: 'data_collection'"); return granted; },
        request: async (req) => { calls.requests.push(req); return true; },
      },
      runtime: { openOptionsPage: async () => { calls.opened++; } },
    };
    loadClassic(new URL("../src/options.js", import.meta.url), { PeaceBeStill, PeaceBeStillPage, setTimeout, clearTimeout, document, browser, location: { search: "?popup" }, screen: { width: 1920 }, close: () => { calls.closed++; } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const row = rowsOf(byId.features).find((r) => r.name === "dislikeCount");
    row.box.checked = true;
    await byId.features.listeners.change({ target: row.box });
    return { ...calls, checked: row.box.checked };
  };

  const notYet = await run(false);
  assert.equal(notYet.requests.length, 0, "the popup never asks");
  assert.equal(notYet.opened, 1, "the options page opens to ask instead");
  assert.equal(notYet.closed, 1);
  assert.equal(notYet.checked, false, "and the box is not left ticked over nothing stored");
  assert.deepEqual(plain(notYet.writes), []);

  const already = await run(true);
  assert.deepEqual(plain(already.writes), [{ dislikeCount: true }], "already granted: stored straight away");
  assert.equal(already.opened + already.requests.length, 0);

  const chromium = await run("throws");
  assert.deepEqual(plain(chromium.writes), [{ dislikeCount: true }], "no such permission (Chromium): stored as before");
});

// Disabling sets everything aside, in this browser only: when it ends goes to
// storage.local, never to the synced settings, and the button turns into
// Enable, which takes it away again.
function renderDisable(disabledUntil) {
  const { PeaceBeStill } = loadCore(new URL("../src/", import.meta.url));
  const { document, byId } = fakeDocument();
  const local = { sets: [], removes: [] };
  const syncWrites = [];
  const chrome = { storage: {
    sync: { get: async () => ({}), set: async (o) => { syncWrites.push(o); }, remove: async (k) => { syncWrites.push(k); } },
    local: {
      get: async () => (disabledUntil === undefined ? {} : { disabledUntil }),
      set: async (o) => { local.sets.push(o); },
      remove: async (k) => { local.removes.push(k); },
    },
  } };
  loadClassic(new URL("../src/options.js", import.meta.url), { PeaceBeStill, PeaceBeStillPage, document, chrome, setTimeout, clearTimeout });
  return { byId, local, syncWrites };
}

test("Disable offers indefinitely, 1, 2 or 24 hours, keeps its choice in storage.local, and Enable takes it back", async () => {
  const { byId, local, syncWrites } = renderDisable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(plain(byId["disable-for"].children).map((o) => [o.value, o.textContent]),
    [["forever", "Indefinitely"], ["1", "1 hour"], ["2", "2 hours"], ["24", "24 hours"]]);
  assert.equal(byId["disable-for"].value, "forever", "indefinitely is the first choice, and picked");
  assert.equal(byId.disable.textContent, "Disable");
  assert.equal(byId.disabled.textContent, "");

  byId["disable-for"].value = "2";
  const before = Date.now();
  await byId.disable.listeners.click();
  const until = local.sets[0].disabledUntil;
  assert.ok(until >= before + 2 * 3_600_000 && until <= Date.now() + 2 * 3_600_000, "two hours from now");
  assert.equal(byId.disable.textContent, "Enable");
  assert.equal(byId["disable-for"].hidden, true, "no choice to make while disabled");
  assert.match(byId.disabled.textContent, /^Disabled until .+\. Nothing is hidden/);

  await byId.disable.listeners.click();
  assert.deepEqual(plain(local.removes), ["disabledUntil"]);
  assert.equal(byId.disable.textContent, "Disable");
  assert.equal(byId["disable-for"].hidden, false);
  assert.equal(byId.disabled.textContent, "");

  byId["disable-for"].value = "forever";
  await byId.disable.listeners.click();
  assert.deepEqual(plain(local.sets.at(-1)), { disabledUntil: "forever" });
  assert.match(byId.disabled.textContent, /until you enable it again/);
  assert.deepEqual(syncWrites, [], "disabling never touches the synced settings");
});

test("a page opened while disabled shows Enable, and one opened after the time ran out does not", async () => {
  const on = renderDisable("forever");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(on.byId.disable.textContent, "Enable");
  const over = renderDisable(Date.now() - 1000);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(over.byId.disable.textContent, "Disable");
});

test("Clear all settings wants a second click, and forgets the first after a few seconds", async () => {
  const { byId, removes } = await render({ footer: true });
  await byId["clear-all"].listeners.click();
  assert.equal(byId["clear-all"].textContent, "Click again to clear");
  assert.equal(removes.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 4100));
  assert.equal(byId["clear-all"].textContent, "Clear all settings");
  await byId["clear-all"].listeners.click();
  assert.equal(removes.length, 0, "the first click has lapsed, so this is a first click again");
});

test("options.html loads page.js before options.js, which takes the disable key from it", () => {
  const html = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  assert.ok(html.indexOf('src="page.js"') > 0 && html.indexOf('src="page.js"') < html.indexOf('src="options.js"'));
  for (const id of ["clear-all", "disable", "disable-for", "disabled"]) assert.match(html, new RegExp(`id="${id}"`), id);
});
