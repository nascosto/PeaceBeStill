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
    indented: !!(row?.classList.contains("child") || row?.classList.contains("grandchild")),
    grandchild: !!row?.classList.contains("grandchild"),
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

test("every switch is nested under the one that covers it, one indent per level", async () => {
  const { rows } = await render();
  assert.deepEqual(rows().map((r) => r.name), [
    "blackout",
    "home", "feed", "composer", "suggested", "recommended", "socialProof", "homeRedirect",
    "myNetwork", "jobs", "messaging", "messagingOverlay", "notifications", "notificationCount", "profile",
    "ads", "sponsored", "otherAds", "premium", "jobsPromoted",
    "rightRail", "leftRail",
    "games", "news", "forBusiness", "peopleYouMayKnow", "suggestions", "aiAssistant",
  ]);
  // "Hide everything" parents the whole page, so it alone sits flush and
  // everything else is indented -- the switches inside the feed and inside the
  // rails a further step, since they are two levels down.
  const depth = Object.fromEntries(rows().map((r) => [r.name, r.indented ? (r.grandchild ? 2 : 1) : 0]));
  assert.equal(depth.blackout, 0);
  assert.equal(depth.home, 1);
  assert.equal(depth.feed, 2, "the feed is inside Home");
  assert.equal(depth.messagingOverlay, 2, "the overlay is inside Messaging");
  assert.equal(depth.rightRail, 1);
  assert.equal(depth.composer, 2, "the composer is inside the feed");
  assert.equal(depth.suggested, 2, "a post kind is inside the feed");
  assert.equal(depth.ads, 1);
  assert.equal(depth.sponsored, 2, "an advert kind is inside the advert switch");
});

test("a switch an ancestor covers is taken off the list, not explained away", async () => {
  const { rows, change, writes, removes } = await render({ blackout: true });
  const shown = rows().filter((r) => !r.hidden).map((r) => r.name);
  assert.deepEqual(shown, ["blackout"], "with everything hidden there is nothing left to decide");
  // The stored values are untouched, so turning it back off restores them.
  const back = await render({ blackout: false, sponsored: true });
  assert.equal(back.rows().find((r) => r.name === "sponsored").hidden, false);
  assert.equal(back.rows().find((r) => r.name === "sponsored").checked, true);
  // A covered switch still refuses a change, since it cannot be clicked anyway.
  await change("jobs", true);
  assert.deepEqual(plain(writes), []);
  assert.deepEqual(plain(removes), []);
});

test("hiding the feed takes its own switches with it, and leaves the rest", async () => {
  const { rows } = await render({ feed: true });
  const hidden = rows().filter((r) => r.hidden).map((r) => r.name);
  assert.deepEqual(hidden, ["composer", "suggested", "recommended", "socialProof"]);
  // The puzzles are not part of the feed, so they stay.
  assert.equal(rows().find((r) => r.name === "games").hidden, false);
});

test("one switch turns off every advert, and takes their rows with it", async () => {
  const { rows } = await render({ ads: true });
  const hidden = rows().filter((r) => r.hidden).map((r) => r.name);
  assert.deepEqual(hidden, ["sponsored", "otherAds", "premium", "jobsPromoted"]);
  assert.equal(rows().find((r) => r.name === "ads").hidden, false);
});

test("a section with nothing left to show goes too", async () => {
  const { byId } = await render({ blackout: true });
  const sections = byId.features.children.filter((c) => c.tag === "fieldset");
  const visible = sections.filter((sec) => !sec.hidden)
    .map((sec) => sec.children.find((c) => c.tag === "legend").textContent);
  assert.deepEqual(visible, ["The whole site"], "only the section holding the one switch left");
});

test("only a switch that differs from its default is stored", async () => {
  const { change, writes, removes } = await render();
  await change("jobs", true);
  assert.deepEqual(plain(writes), [{ jobs: true }]);
  await change("jobs", false);
  assert.deepEqual(plain(writes), [{ jobs: true }], "nothing more written");
  assert.deepEqual(plain(removes), ["jobs"]);
});

test("settings already stored that match their default are cleaned up on load", async () => {
  const { removes } = await render({ jobs: false, blackout: true });
  assert.deepEqual(plain(removes), [["jobs"]], "blackout differs, so it stays");
});

test("the summary counts what is on, and says how much a switch above has covered", async () => {
  const { byId, rows, removes } = await render({ blackout: true, jobs: true });
  assert.match(byId.summary.textContent, /2 of 28/);
  assert.match(byId.summary.textContent, /27 covered by a switch above/);

  await byId["all-off"].listeners.click();
  assert.deepEqual(plain(removes.at(-1)), ["blackout", "jobs"], "every stored key is dropped");
  assert.equal(rows().every((r) => !r.checked), true);
  assert.match(byId.summary.textContent, /0 of 28/);
});

test("the filter narrows the list to matching switches", async () => {
  const { byId, rows } = await render();
  byId.filter.value = "puzzles";
  await byId.filter.listeners.input();
  assert.deepEqual(rows().filter((r) => !r.hidden).map((r) => r.name), ["games"]);

  // A word several switches share narrows to all of them.
  byId.filter.value = "messaging";
  await byId.filter.listeners.input();
  assert.deepEqual(rows().filter((r) => !r.hidden).map((r) => r.name),
    ["messaging", "messagingOverlay"]);

  byId.filter.value = "";
  await byId.filter.listeners.input();
  assert.equal(rows().filter((r) => r.hidden).length, 0, "clearing the filter shows everything again");
});

test("a storage failure is reported rather than silently pretended", async () => {
  const { byId, change } = await render({}, { failWrites: true });
  await change("blackout", true);
  assert.match(byId.status.textContent, /could not be saved/i);
});
