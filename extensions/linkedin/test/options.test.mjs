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

// Firefox for Android opens this page as an ordinary tab. Without the viewport
// line it is laid out at desktop width and shrunk to fit, so the page is
// legible on a phone only by pinching -- and nothing about that fails loudly
// enough to be noticed from a desktop.
test("the options page is laid out for the screen it is on, not a desktop one", () => {
  const html = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/);
  const css = readFileSync(new URL("../src/options.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: \d+px\)/, "a narrow screen gets its own rules");
  // Nothing may state a width the screen might not have.
  assert.doesNotMatch(css, /min-width:\s*\d{3,}px/, "no floor wider than a phone");
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
      replaceChildren(...nodes) { this.children = [...nodes]; },
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
    disabled: box.disabled === true,
    mirror: row?.getAttribute("data-mirror") === "1",
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

test("every setting gets a control, inside a fieldset with its section as the legend", async () => {
  const { PeaceBeStill, byId, rows } = await render();
  // Every setting is drawn once, and the mirrored one twice.
  const drawn = rows().filter((r) => !r.mirror).map((r) => r.name).sort();
  assert.deepEqual(drawn, [...PeaceBeStill.KEYS].sort());
  assert.deepEqual(rows().filter((r) => r.mirror).map((r) => r.name), ["sponsored"]);
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
    // "sponsored" appears twice on purpose: an advert in the feed is both an
    // advert and part of the feed, so it is offered in both places.
    "home", "feed", "composer", "suggested", "recommended", "socialProof", "sponsored", "homeGames", "news",
    "myNetwork", "networkPeople", "networkSuggestions", "networkGames", "networkPremium", "jobs", "jobsSuggestions",
    "messaging", "notifications", "profile", "profilePeople", "profileSuggestions", "homeRedirect",
    "ads", "sponsored", "otherAds", "premium", "jobsPromoted",
    "games", "forBusiness", "siteFooter", "aiAssistant",
    "messagingOverlay", "notificationCount",
  ]);
  // "Hide everything" parents the whole page, so it alone sits flush and
  // everything else is indented -- the switches inside the feed and inside the
  // advert switch a further step, since they are two levels down.
  const depth = Object.fromEntries(rows().map((r) => [r.name, r.depth]));
  assert.equal(depth.blackout, 0);
  assert.equal(depth.home, 1);
  assert.equal(depth.feed, 2, "the feed is inside Home");

  assert.equal(depth.composer, 3, "the composer is inside the feed, inside Home");
  assert.equal(depth.suggested, 3, "a post kind is inside the feed, inside Home");
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
  // "sponsored" here is the second row, shown under the feed. With no feed to
  // advertise in, a ticked and locked copy of it says nothing worth the space.
  assert.deepEqual(hidden, ["composer", "suggested", "recommended", "socialProof", "sponsored"]);
  // The puzzles are not part of the feed, so they stay.
  assert.equal(rows().find((r) => r.name === "games").hidden, false);
});

test("the mirrored advert switch is ticked and locked when the global one is on", async () => {
  const mirror = (world) => world.rows().find((r) => r.mirror);

  const plain2 = await render();
  assert.equal(mirror(plain2).checked, false);
  assert.equal(mirror(plain2).disabled, false);
  assert.equal(mirror(plain2).hidden, false);

  // Hiding every advert covers this one, so its second row says so rather than
  // vanishing: the thing is happening, and not yours to change from here.
  const global = await render({ ads: true });
  assert.equal(mirror(global).checked, true);
  assert.equal(mirror(global).disabled, true);
  assert.equal(mirror(global).hidden, false);
  // Its own row, under Advertisements, is taken away as any covered row is.
  assert.equal(global.rows().find((r) => r.name === "sponsored" && !r.mirror).hidden, true);

  // Hiding the feed covers it too -- but there it goes rather than staying on
  // as a locked tick, because the switch above it has already said as much.
  const noFeed = await render({ feed: true });
  assert.equal(mirror(noFeed).hidden, true);

  // And it goes entirely when the switch it is shown under has itself gone.
  const noHome = await render({ home: true });
  assert.equal(mirror(noHome).hidden, true);
});

test("one switch turns off every advert, and takes their rows with it", async () => {
  const { rows } = await render({ ads: true });
  const hidden = rows().filter((r) => r.hidden).map((r) => r.name);
  assert.deepEqual(hidden, ["sponsored", "otherAds", "premium", "jobsPromoted"]);
  assert.equal(rows().find((r) => r.name === "ads").hidden, false);
});

test("the chooser's list is replaced on every render, not added to", async () => {
  const { rows, change } = await render();
  const chooser = () => rows().find((r) => r.name === "homeRedirect").box;
  const count = chooser().children.length;
  assert.equal(count, 6, "Home plus the five places it can send you");
  // Every change redraws the page; the list must not grow each time.
  await change("myNetwork", true);
  assert.equal(chooser().children.length, 5, "My Network drops out, nothing is duplicated");
  await change("myNetwork", false);
  assert.equal(chooser().children.length, 6, "and comes back, still once");
  await change("jobs", true);
  await change("jobs", false);
  assert.equal(chooser().children.length, 6, "still once after several redraws");
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
  assert.match(byId.summary.textContent, /2 of 33/);
  assert.match(byId.summary.textContent, /32 covered by a switch above/);

  await byId["all-off"].listeners.click();
  assert.deepEqual(plain(removes.at(-1)), ["blackout", "jobs"], "every stored key is dropped");
  assert.equal(rows().every((r) => !r.checked), true);
  assert.match(byId.summary.textContent, /0 of 33/);
});

test("the filter narrows the list to matching switches", async () => {
  const { byId, rows } = await render();
  // Puzzles can be hidden on one page or on all of them, so the word finds the
  // per-page switches under their pages as well as the global one.
  byId.filter.value = "puzzles";
  await byId.filter.listeners.input();
  assert.deepEqual(rows().filter((r) => !r.hidden).map((r) => r.name),
    ["homeGames", "networkGames", "games"]);

  // A word several switches share narrows to all of them.
  byId.filter.value = "messaging";
  await byId.filter.listeners.input();
  assert.deepEqual(rows().filter((r) => !r.hidden).map((r) => r.name),
    ["messaging", "messagingOverlay"]);

  byId.filter.value = "";
  await byId.filter.listeners.input();
  assert.equal(rows().filter((r) => r.hidden).length, 0, "clearing the filter shows everything again");
});

test("a change from something that is not a setting writes nothing", async () => {
  const { byId, writes, removes } = await render();
  // A change event whose target is the form, not a control, must be ignored:
  // storage here follows the browser account, so junk in it travels.
  await byId.features.listeners.change({ target: { name: "", checked: true } });
  await byId.features.listeners.change({ target: { name: "notASetting", checked: true } });
  assert.deepEqual(plain(writes), []);
  assert.deepEqual(plain(removes), []);
});

test("a storage failure is reported rather than silently pretended", async () => {
  const { byId, change } = await render({}, { failWrites: true });
  await change("blackout", true);
  assert.match(byId.status.textContent, /could not be saved/i);
});

// Puzzles turn up on more than one page, so they can be hidden page by page or
// everywhere at once. The global one is not their parent -- they sit under
// their own pages -- so it has to say so itself.
test("hiding puzzles everywhere ticks and locks the per-page switches", async () => {
  const { rows } = await render({ games: true });
  for (const name of ["homeGames", "networkGames"]) {
    const row = rows().find((r) => r.name === name);
    assert.equal(row.checked, true, `${name} should show as happening`);
    assert.equal(row.disabled, true, `${name} should not be yours to set while the global one is on`);
    assert.equal(row.hidden, false, `${name} should stay on the page, not vanish`);
  }
});

test("hiding puzzles on one page leaves the other page alone", async () => {
  const { rows } = await render({ homeGames: true });
  assert.equal(rows().find((r) => r.name === "homeGames").checked, true);
  assert.equal(rows().find((r) => r.name === "networkGames").checked, false);
  assert.equal(rows().find((r) => r.name === "games").checked, false);
  for (const name of ["homeGames", "networkGames"]) {
    assert.equal(rows().find((r) => r.name === name).disabled, false, `${name} is still yours to set`);
  }
});

test("a page that is hidden takes its puzzle switch with it", async () => {
  // Nothing to decide about puzzles on a page you cannot reach.
  const { rows } = await render({ home: true });
  assert.equal(rows().find((r) => r.name === "homeGames").hidden, true);
  assert.equal(rows().find((r) => r.name === "networkGames").hidden, false);
});

// "People who viewed your profile" is a Premium panel, and it is on My Network
// as well as on a profile, so it can be hidden there without hiding Premium
// everywhere.
test("hiding Premium everywhere ticks and locks the My Network switch", async () => {
  for (const stored of [{ premium: true }, { ads: true }]) {
    const { rows } = await render(stored);
    const row = rows().find((r) => r.name === "networkPremium");
    assert.equal(row.checked, true, `covered by ${Object.keys(stored)[0]}`);
    assert.equal(row.disabled, true, `covered by ${Object.keys(stored)[0]}`);
    assert.equal(row.hidden, false, `covered by ${Object.keys(stored)[0]}`);
  }
});

test("hiding Premium on My Network alone leaves the global switch off", async () => {
  const { rows } = await render({ networkPremium: true });
  assert.equal(rows().find((r) => r.name === "networkPremium").checked, true);
  assert.equal(rows().find((r) => r.name === "networkPremium").disabled, false);
  assert.equal(rows().find((r) => r.name === "premium").checked, false);
});
