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

test("switches are grouped, and only nest where parent and child share a section", async () => {
  const { rows } = await render();
  assert.deepEqual(rows().map((r) => r.name), [
    "blackout",
    "feed", "composer", "homeToMessaging", "homeToNotifications", "homeToJobs",
    "sponsored", "suggested", "recommended", "socialProof",
    "rightRail", "rightRailAds", "games", "news", "leftRail",
    "jobsPromoted", "peopleYouMayKnow", "suggestions", "aiAssistant",
    "notificationCount",
  ]);
  // Blackout parents everything but has a section to itself, and the post
  // kinds sit in their own section away from `feed`, so neither draws an
  // indent. The three right-rail modules do live beside their parent.
  const indented = Object.fromEntries(rows().map((r) => [r.name, r.indented]));
  assert.deepEqual(
    Object.entries(indented).filter(([, i]) => i).map(([n]) => n),
    ["composer", "rightRailAds", "games", "news"],
  );
});

test("with the site blacked out every other switch says so, stays reachable by keyboard, and cannot be changed", async () => {
  const { rows, change, writes, removes } = await render({ blackout: true });
  for (const row of rows().filter((r) => r.name !== "blackout")) {
    assert.equal(row.moot, true, row.name);
    assert.equal(row.ariaDisabled, "true", `${row.name} is announced as disabled`);
    assert.equal(row.reallyDisabled, false, `${row.name} must stay in the tab order`);
    // An indented switch points at the row above it; one that was pushed into
    // another section has to name the switch that locked it.
    // Blackout is what locked them, so blackout is what every note names --
    // including the indented ones, whose own parent is off.
    assert.match(row.note, /Replace LinkedIn with a better idea/, row.name);
  }
  assert.equal(rows().find((r) => r.name === "blackout").moot, false);

  // Clicking a locked one changes nothing.
  await change("homeToJobs", true);
  assert.deepEqual(plain(writes), []);
  assert.deepEqual(plain(removes), []);
  assert.equal(rows().find((r) => r.name === "homeToJobs").checked, false, "the tick is put back");
});

test("a note names the switch that actually locked it, not the parent that is off", async () => {
  // Hiding the feed makes the post kinds moot; the right rail makes its own
  // modules moot, and those sit directly beneath it.
  const feedOff = await render({ feed: true });
  assert.match(feedOff.rows().find((r) => r.name === "sponsored").note, /Hide the feed entirely/);
  const railOff = await render({ rightRail: true });
  assert.equal(railOff.rows().find((r) => r.name === "games").note, "no effect while the switch above is on");
  // And a switch nothing has locked says nothing at all.
  assert.equal(feedOff.rows().find((r) => r.name === "games").note, "");
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
  assert.match(byId.summary.textContent, /2 of 20/);

  await byId["all-off"].listeners.click();
  assert.deepEqual(plain(removes.at(-1)), ["blackout", "homeToJobs"], "every stored key is dropped");
  assert.equal(rows().every((r) => !r.checked), true);
  assert.match(byId.summary.textContent, /0 of 20/);
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
