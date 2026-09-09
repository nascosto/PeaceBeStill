# PeaceBeStill - LinkedIn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Superseded in part, 2026-09-09.** This plan was executed, but the extension
> then grew from five switches to eighteen once its pages could actually be
> read in a signed-in browser. Two of its statements are now wrong: LinkedIn
> does have an audit (a manual one -- see the spec's Verification section), and
> the stylesheet no longer does all the hiding, because a marking pass in
> `content.js` is needed for anything identified by a visible label. The spec
> is the current document; this is the record of the first pass.

**Goal:** Add a second extension, `PeaceBeStill - LinkedIn`, to this repo: five switches, all off by default, led by a `blackout` switch that replaces every LinkedIn page with the sentence "You made the right choice."

**Architecture:** The same chassis as `extensions/youtube`. `core.js` is a classic script publishing one global that holds the feature table and every pure decision; `content.js` writes the enabled keys onto `<html data-peacebestill="…">` and `hide.css` gates one rule per key on that attribute, so a toggle reaches open tabs without a reload. `blackout` is the declared parent of every other switch, which the existing `isMoot`/`effective` machinery already handles with no new logic.

**Tech Stack:** Manifest V3, plain JavaScript (no bundler, no framework), `node --test` with `vm`-based classic-script loading, `web-ext` for lint/build/sign, ImageMagick for icon rendering. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-peacebestill-linkedin-design.md`

## Global Constraints

Every task's requirements implicitly include all of these.

- **Every switch defaults to `false`.** A fresh install changes nothing and stores nothing.
- **Add-on ID is `linkedin@peacebestill.fyi`.** Nothing that ships or is published may carry a personal name, address or domain. A Firefox add-on GUID is permanently public and cannot be changed after first submission.
- **The source manifest carries no `update_url`, at either level.** Both stores reject a package naming its own update service; `scripts/variant.mjs` adds the keys back for the self-hosted build.
- **`strict_min_version: "142.0"`** for both `gecko` and `gecko_android`; `minimum_chrome_version: "120"`.
- **`permissions: ["storage"]` only.** No `host_permissions`, no background script, no `tabs`.
- **The extension makes no network requests, in any configuration.** `data_collection_permissions` is `required: ["none"]` with no `optional` key.
- **`manifest.json` version must equal `package.json`'s** — currently `1.0.0`. `scripts/check-version.mjs` refuses a tag that disagrees.
- **The manifest description must state the switch count**, and it must equal `KEYS.length`. There is a test for this. Five switches at v1.0.
- **No guessed selectors.** No switch ships against LinkedIn markup that has not been read and then checked in a browser. v1.0 uses no selectors at all.
- **This repo is public.** Never commit LinkedIn markup, scrubbed or otherwise.
- **Node >= 20.** Tests are `node --test`. Add no dependencies.

---

### Task 1: `core.js` — the feature table and every pure decision

**Files:**
- Create: `extensions/linkedin/src/core.js`
- Test: `extensions/linkedin/test/core.test.mjs`

**Interfaces:**
- Consumes: `test/helpers/load-classic.mjs` (existing) — `loadClassic(url, extraGlobals)` runs a classic script in a fresh `vm` context and returns that context.
- Produces: `globalThis.PeaceBeStill` with `GROUPS: string[]`, `FEATURES: [key, label, defaultOn, group, parent?][]`, `KEYS: string[]`, `BLACKOUT_TITLE: string`, `defaults(): Record<string, boolean>`, `withDefaults(settings): Record<string, boolean>`, `effective(stored): Record<string, boolean>`, `isDefaultValue(key, value): boolean`, `redundantKeys(stored): string[]`, `parentOf(key): string | null`, `isMoot(key, settings): boolean`, `tokensFor(settings): string`, `redirectFor(pathname, settings): string | null`, `untitled(title): string`, `titleFor(title, settings): string | null`.

Note on realms: `PeaceBeStill` comes from another `vm` realm, so its arrays and objects have foreign prototypes. Copy them (`[...arr]`, `{...obj}`) before strict deep-equality, exactly as the YouTube tests do.

- [ ] **Step 1: Write the failing test**

Create `extensions/linkedin/test/core.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));

// Every key, in order, with its default. This is the contract the options
// page, the stylesheet gates and the stored settings all share.
const DEFAULTS = [
  "blackout",
  "homeToMessaging", "homeToNotifications", "homeToJobs",
  "notificationCount",
].map((key) => [key, false]);

const KEYS = DEFAULTS.map(([k]) => k);
const GROUPS = ["The whole site", "Home and feed", "Notifications"];

test("the feature keys are the agreed five, in order, each with a label, a default and a group", () => {
  assert.deepEqual([...PeaceBeStill.KEYS], KEYS);
  for (const [key, label, defaultOn, group] of PeaceBeStill.FEATURES) {
    assert.ok(KEYS.includes(key), key);
    assert.ok(label.length > 10, `label for ${key}`);
    assert.equal(typeof defaultOn, "boolean", `default for ${key}`);
    assert.ok(GROUPS.includes(group), `group for ${key}: ${group}`);
  }
  assert.deepEqual([...PeaceBeStill.GROUPS], GROUPS);
});

test("nothing is on by default: the extension does nothing until asked", () => {
  assert.deepEqual({ ...PeaceBeStill.defaults() }, Object.fromEntries(DEFAULTS));
  assert.equal(PeaceBeStill.tokensFor({}), "");
  assert.equal(PeaceBeStill.tokensFor(undefined), "");
});

// The whole design of the options page rests on this: blackout hides the
// entire site, so nothing else can have any effect while it is on.
test("blackout is top level and the parent of every other switch", () => {
  assert.equal(PeaceBeStill.parentOf("blackout"), null);
  for (const key of KEYS.filter((k) => k !== "blackout")) {
    assert.equal(PeaceBeStill.parentOf(key), "blackout", key);
  }
});

test("blackout makes every other switch moot, and nothing is moot without it", () => {
  for (const key of KEYS.filter((k) => k !== "blackout")) {
    assert.equal(PeaceBeStill.isMoot(key, { blackout: true }), true, key);
    assert.equal(PeaceBeStill.isMoot(key, {}), false, key);
    assert.equal(PeaceBeStill.isMoot(key, { blackout: false }), false, key);
  }
  assert.equal(PeaceBeStill.isMoot("blackout", { blackout: true }), false, "a parent is never moot");
  assert.equal(PeaceBeStill.isMoot("bogus", { blackout: true }), false, "unknown keys are never moot");
});

test("no feature is its own ancestor, and every parent named is a real key", () => {
  for (const [key, , , , parent] of PeaceBeStill.FEATURES) {
    if (parent === undefined) continue;
    assert.ok(KEYS.includes(parent), `${key} names unknown parent ${parent}`);
    const seen = new Set([key]);
    for (let p = parent; p; p = PeaceBeStill.parentOf(p)) {
      assert.ok(!seen.has(p), `cycle through ${p}`);
      seen.add(p);
    }
  }
});

test("effective: a fresh install runs nothing, and blackout forces everything else off", () => {
  const eff = PeaceBeStill.effective;
  assert.deepEqual(Object.entries(eff({})).filter(([, on]) => on), [], "a fresh install runs nothing");
  assert.deepEqual({ ...eff({}) }, { ...PeaceBeStill.defaults() });

  const black = eff({ blackout: true, homeToJobs: true, notificationCount: true });
  assert.equal(black.blackout, true);
  assert.equal(black.homeToJobs, false);
  assert.equal(black.notificationCount, false);

  assert.equal(eff({ homeToJobs: true }).homeToJobs, true);
  assert.equal(eff({ blackout: "yes" }).blackout, false, "junk is not truth");
  assert.equal(eff(undefined).blackout, false);
});

// This is what content.js actually does: effective() first, then tokensFor().
test("the attribute reads exactly 'blackout' while the site is blacked out", () => {
  const { tokensFor, effective } = PeaceBeStill;
  assert.equal(tokensFor(effective({ blackout: true, homeToJobs: true, notificationCount: true })), "blackout");
  assert.equal(tokensFor(effective({ notificationCount: true })), "notificationCount");
  assert.equal(tokensFor(effective({})), "");
});

test("a key that is absent, or removed while the page is open, falls back to its default", () => {
  // storage.onChanged reports a removal as a change with no newValue, so the
  // content script can hand us undefined for a key. That must mean "default".
  assert.equal(PeaceBeStill.tokensFor({ blackout: undefined }), "");
  assert.equal(PeaceBeStill.isMoot("homeToJobs", { blackout: undefined }), false);
  assert.equal(PeaceBeStill.redirectFor("/", { homeToJobs: undefined }), null);
});

test("a value equal to its default is redundant and need not be stored", () => {
  assert.equal(PeaceBeStill.isDefaultValue("blackout", false), true);
  assert.equal(PeaceBeStill.isDefaultValue("blackout", true), false);
  assert.equal(PeaceBeStill.isDefaultValue("bogus", false), false, "unknown keys are never called redundant");
  assert.deepEqual([...PeaceBeStill.redundantKeys({ blackout: false, homeToJobs: true, bogus: 1 })], ["blackout"]);
  assert.deepEqual([...PeaceBeStill.redundantKeys({})], []);
  assert.deepEqual([...PeaceBeStill.redundantKeys(undefined)], []);
});

test("redirectFor sends the home page where asked, and leaves every other page alone", () => {
  const r = PeaceBeStill.redirectFor;
  assert.equal(r("/", { homeToMessaging: true }), "/messaging/");
  assert.equal(r("/feed", { homeToMessaging: true }), "/messaging/");
  assert.equal(r("/feed/", { homeToNotifications: true }), "/notifications/");
  assert.equal(r("/", { homeToJobs: true }), "/jobs/");
  // Anywhere that is not the home page is left alone, including the
  // destinations themselves -- otherwise the redirect would loop.
  for (const path of ["/messaging/", "/notifications/", "/jobs/", "/in/someone", "/feed/update/urn:li:activity:1", ""]) {
    assert.equal(r(path, { homeToMessaging: true, homeToNotifications: true, homeToJobs: true }), null, path);
  }
  assert.equal(r(undefined, { homeToJobs: true }), null);
  assert.equal(r("/", {}), null, "off by default");
});

test("with more than one destination on, the first in table order wins", () => {
  const r = PeaceBeStill.redirectFor;
  assert.equal(r("/", { homeToMessaging: true, homeToNotifications: true, homeToJobs: true }), "/messaging/");
  assert.equal(r("/", { homeToNotifications: true, homeToJobs: true }), "/notifications/");
  assert.equal(r("/", { homeToJobs: true }), "/jobs/");
});

test("a blacked-out site never navigates", () => {
  assert.equal(PeaceBeStill.redirectFor("/", { blackout: true, homeToJobs: true }), null);
});

test("untitled strips the unread count LinkedIn prepends to the tab title", () => {
  assert.equal(PeaceBeStill.untitled("(3) Feed | LinkedIn"), "Feed | LinkedIn");
  assert.equal(PeaceBeStill.untitled("(12) Messaging | LinkedIn"), "Messaging | LinkedIn");
  assert.equal(PeaceBeStill.untitled("Feed | LinkedIn"), "Feed | LinkedIn");
  assert.equal(PeaceBeStill.untitled("(New) Something | LinkedIn"), "(New) Something | LinkedIn", "only digits are a count");
});

test("titleFor: blackout says the sentence, notificationCount drops the count, null means leave it", () => {
  const t = PeaceBeStill.titleFor;
  const SAID = PeaceBeStill.BLACKOUT_TITLE;
  assert.equal(SAID, "You made the right choice.");

  assert.equal(t("(3) Feed | LinkedIn", { blackout: true }), SAID);
  assert.equal(t(SAID, { blackout: true }), null, "already right, nothing to do");
  assert.equal(t("(3) Feed | LinkedIn", { notificationCount: true }), "Feed | LinkedIn");
  assert.equal(t("Feed | LinkedIn", { notificationCount: true }), null);
  assert.equal(t("(3) Feed | LinkedIn", {}), null, "both switches off");
  // Blackout wins: it is the parent, and the page says the same thing.
  assert.equal(t("(3) Feed | LinkedIn", { blackout: true, notificationCount: true }), SAID);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/ben/Projects/PeaceBeStill && node --test extensions/linkedin/test/core.test.mjs`
Expected: FAIL — `ENOENT` on `extensions/linkedin/src/core.js`.

- [ ] **Step 3: Write the implementation**

Create `extensions/linkedin/src/core.js`:

```js
// Shared by the content script and the options page. Content scripts cannot
// be ES modules, so this is a classic script that publishes one global.
(function (root) {
  // Options-page sections, in display order. Blackout has one to itself, and
  // it comes first, because it is the parent of everything below it.
  const GROUPS = ["The whole site", "Home and feed", "Notifications"];
  const [SITE, HOME, NOTIFICATIONS] = GROUPS;

  // What the page says, and what the tab says, once the site is blacked out.
  // hide.css draws this string; a test holds the two to the same sentence.
  const BLACKOUT_TITLE = "You made the right choice.";

  // [key, label, on by default, group, parent?]. The order here is the order
  // of the data-peacebestill tokens; the options page groups by the fourth field
  // and nests by the fifth. A parent is a switch that hides the thing its
  // children live inside, so while it is on they cannot matter.
  //
  // Blackout is the parent of every other switch: it replaces the entire site,
  // so nothing else can have any effect. Nothing about that needs new logic --
  // isMoot walks the parent chain, and options.js only nests a child under its
  // parent when the two share a group, so every switch below still renders at
  // the top level of its own section.
  //
  // Every default is false: a fresh install changes nothing about LinkedIn
  // until you switch something on. That also means storage holds exactly the
  // switches you turned on, since a value equal to its default is not stored.
  const FEATURES = [
    ["blackout", "Replace LinkedIn with a better idea", false, SITE],
    ["homeToMessaging", "Open Messaging instead of the home feed", false, HOME, "blackout"],
    ["homeToNotifications", "Open Notifications instead of the home feed", false, HOME, "blackout"],
    ["homeToJobs", "Open Jobs instead of the home feed", false, HOME, "blackout"],
    ["notificationCount", "Hide the unread count in the tab title", false, NOTIFICATIONS, "blackout"],
  ];
  const KEYS = FEATURES.map(([key]) => key);

  // The home page, by every path LinkedIn serves it at, and where each switch
  // sends it. A destination is never itself a home path, so a redirect cannot
  // loop.
  const HOME_PATHS = ["/", "/feed", "/feed/"];
  const DESTINATIONS = [
    ["homeToMessaging", "/messaging/"],
    ["homeToNotifications", "/notifications/"],
    ["homeToJobs", "/jobs/"],
  ];

  function defaults() {
    return Object.fromEntries(FEATURES.map(([key, , defaultOn]) => [key, defaultOn]));
  }

  // Stored settings over the defaults. Only booleans count, so a key that is
  // absent, removed (storage.onChanged reports a removal as undefined) or
  // junk falls back to its default. That is what lets us store only the
  // switches you have actually changed, and lets a later version's new
  // default reach everyone who never touched that switch.
  function withDefaults(settings) {
    const merged = defaults();
    for (const [key, value] of Object.entries(settings || {})) {
      if (typeof value === "boolean") merged[key] = value;
    }
    return merged;
  }

  // Settings -> the value of the root element's data-peacebestill attribute: the
  // enabled keys, space separated, so hide.css can gate on ~="key".
  function tokensFor(settings) {
    const merged = withDefaults(settings);
    return KEYS.filter((key) => merged[key] === true).join(" ");
  }

  // True when this value is what the feature would do anyway, so storing it
  // would be storing nothing. Unknown keys are never redundant: we do not
  // own them and must not delete them.
  function isDefaultValue(key, value) {
    const all = defaults();
    return Object.prototype.hasOwnProperty.call(all, key) && all[key] === value;
  }

  // The stored keys worth deleting: everything already equal to its default.
  function redundantKeys(stored) {
    return Object.entries(stored || {})
      .filter(([key, value]) => isDefaultValue(key, value))
      .map(([key]) => key);
  }

  // The switch a feature lives inside, or null. Only one level deep today,
  // but isMoot walks the whole chain so deeper nesting would just work.
  function parentOf(key) {
    const feature = FEATURES.find(([featureKey]) => featureKey === key);
    return (feature && feature[4]) || null;
  }

  // True when some ancestor of this feature is switched on, i.e. the thing it
  // acts on is already hidden, so the feature cannot have any effect. The
  // options page greys such a switch out; its stored value is left alone, so
  // turning the parent off brings it back exactly as it was.
  function isMoot(key, settings) {
    const merged = withDefaults(settings);
    const seen = new Set();
    for (let parent = parentOf(key); parent && !seen.has(parent); parent = parentOf(parent)) {
      if (merged[parent] === true) return true;
      seen.add(parent);
    }
    return false;
  }

  // What the content script should actually do, given what is stored: the
  // defaults filled in, and any switch its parent has made moot forced off.
  // Everything downstream reads this and tests each key for truth, so a key
  // that is absent -- which is every key on a fresh install, since only
  // non-default values are stored -- can never be mistaken for "on".
  function effective(stored) {
    const merged = withDefaults(stored);
    for (const key of KEYS) {
      if (merged[key] && isMoot(key, merged)) merged[key] = false;
    }
    return merged;
  }

  // Where the home page should go instead, or null. Only the home page is ever
  // redirected. If more than one destination is switched on the first in
  // FEATURES order wins, so the answer is defined rather than whichever key
  // happened to be iterated first. A blacked-out site never navigates: there
  // is nothing at the other end worth loading.
  function redirectFor(pathname, settings) {
    const merged = withDefaults(settings);
    if (merged.blackout === true) return null;
    if (!HOME_PATHS.includes(pathname || "")) return null;
    for (const [key, target] of DESTINATIONS) if (merged[key] === true) return target;
    return null;
  }

  // "(3) Feed | LinkedIn" -> "Feed | LinkedIn": the unread count LinkedIn
  // prepends to the tab title.
  function untitled(title) {
    return String(title).replace(/^\(\d+\)\s+/, "");
  }

  // What the tab should say, given what it says now, or null to leave it
  // alone. Blackout replaces the page, so the tab says the same sentence
  // rather than still advertising a feed and an unread count.
  function titleFor(title, settings) {
    const merged = withDefaults(settings);
    if (merged.blackout === true) return title === BLACKOUT_TITLE ? null : BLACKOUT_TITLE;
    if (merged.notificationCount !== true) return null;
    const calm = untitled(title);
    return calm === title ? null : calm;
  }

  root.PeaceBeStill = { GROUPS, FEATURES, KEYS, BLACKOUT_TITLE, defaults, withDefaults, effective, isDefaultValue, redundantKeys, parentOf, isMoot, tokensFor, redirectFor, untitled, titleFor };
})(globalThis);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/ben/Projects/PeaceBeStill && node --test extensions/linkedin/test/core.test.mjs`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/ben/Projects/PeaceBeStill
git add extensions/linkedin/src/core.js extensions/linkedin/test/core.test.mjs
git commit -m "Add the LinkedIn extension's feature table

Five switches, all off. Blackout is the parent of the other four, so the
existing moot machinery greys them out and forces them off while the whole
site is replaced -- no new logic needed for that."
```

---

### Task 2: `hide.css` — the blackout rules and the gate contract

**Files:**
- Create: `extensions/linkedin/src/hide.css`
- Test: `extensions/linkedin/test/hide-css.test.mjs`

**Interfaces:**
- Consumes: `PeaceBeStill.KEYS` and `PeaceBeStill.BLACKOUT_TITLE` from Task 1.
- Produces: a stylesheet whose every rule is gated on `html[data-peacebestill~="<key>"]`.

The YouTube copy of this test asserts that *every* declaration in the stylesheet is `display: none !important;`. Blackout has to draw something as well as hide, so the LinkedIn copy exempts that one gate **by name** and holds every other gate to the hiding-only rule — and a further test asserts the exemption list is exactly `["blackout"]`, so the exemption cannot silently widen. Two other details of the YouTube test do **not** carry over: its floor of at least 30 declarations, which a two-rule stylesheet would fail, and its `SCRIPT_ONLY` contents.

- [ ] **Step 1: Write the failing test**

Create `extensions/linkedin/test/hide-css.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

const css = readFileSync(new URL("../src/hide.css", import.meta.url), "utf8");
const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));

// Features with no stylesheet rule at all: pure script.
const SCRIPT_ONLY = ["homeToMessaging", "homeToNotifications", "homeToJobs", "notificationCount"];
const HIDE = "display: none !important;";

const rules = [...css.matchAll(/html\[data-peacebestill~="([^"]+)"\][^{]*\{([^}]*)\}/g)]
  .map((m) => ({ gate: m[1], body: m[2].trim() }));
const gates = rules.map((r) => r.gate);

test("every gate in hide.css is a known feature key", () => {
  assert.ok(rules.length > 0, "the stylesheet has no gated rules at all");
  for (const gate of gates) assert.ok(PeaceBeStill.KEYS.includes(gate), `unknown gate ${gate}`);
});

test("every non-script feature has a gate; script-only features have none", () => {
  for (const key of PeaceBeStill.KEYS.filter((k) => !SCRIPT_ONLY.includes(k))) {
    assert.ok(gates.includes(key), `no rule gated on ${key}`);
  }
  for (const key of SCRIPT_ONLY) assert.ok(!gates.includes(key), `${key} should not be in the stylesheet`);
});

// Blackout has to draw a sentence as well as hide the page, so it is the one
// gate allowed to do anything but hide. Naming it keeps the guard meaningful:
// widening the allowed declarations instead would permit anything anywhere.
test("blackout is the only gate exempt from the hiding-only rule", () => {
  const exempt = [...new Set(rules.filter((r) => r.body !== HIDE).map((r) => r.gate))];
  assert.deepEqual(exempt, ["blackout"]);
});

test("every rule but blackout's only hides", () => {
  for (const { gate, body } of rules) {
    if (gate === "blackout") continue;
    assert.equal(body, HIDE, gate);
  }
});

// The tab and the page must say the same thing; core.js owns the sentence.
test("blackout hides the page and draws the sentence core.js puts in the tab", () => {
  const blackout = rules.filter((r) => r.gate === "blackout");
  assert.ok(blackout.some((r) => r.body === HIDE), "blackout must hide the page");
  assert.ok(
    css.includes(`content: "${PeaceBeStill.BLACKOUT_TITLE}";`),
    `the stylesheet must draw ${JSON.stringify(PeaceBeStill.BLACKOUT_TITLE)}`,
  );
});

// LinkedIn ships a dark mode. An inherited colour could land dark text on a
// dark ground, so blackout states both.
test("the blackout text states its own colours", () => {
  const drawn = rules.find((r) => r.gate === "blackout" && r.body.includes("content:"));
  assert.ok(drawn, "no rule draws the sentence");
  assert.match(drawn.body, /color:/);
  assert.ok(rules.some((r) => r.gate === "blackout" && /background:/.test(r.body)), "the page needs a ground of its own");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/ben/Projects/PeaceBeStill && node --test extensions/linkedin/test/hide-css.test.mjs`
Expected: FAIL — `ENOENT` on `extensions/linkedin/src/hide.css`.

- [ ] **Step 3: Write the implementation**

Create `extensions/linkedin/src/hide.css`:

```css
/* Each rule is gated on a token in the root element's data-peacebestill attribute,
   which content.js keeps equal to the set of enabled feature keys. So the
   stylesheet is fully static and a toggle takes effect without a reload.
   Rules only ever hide (display: none); blackout is the one exception, because
   replacing the site means drawing something as well as hiding everything. */

/* ---- The whole site ----------------------------------------------------- */

/* Blackout: the page goes, and a sentence takes its place.
   Hiding body and generating the text on the root element depends on no
   LinkedIn markup whatsoever, so this works unchanged on the mobile site and
   needs no second set of rules for Firefox for Android.
   The sentence is core.js's BLACKOUT_TITLE, which also becomes the tab title;
   a test holds the two to the same string.
   Colours are stated rather than inherited: LinkedIn ships a dark mode, and an
   inherited colour could put dark text on a dark ground. */
html[data-peacebestill~="blackout"] body { display: none !important; }
html[data-peacebestill~="blackout"] { color-scheme: light dark; background: light-dark(#ffffff, #1c1b22) !important; }
html[data-peacebestill~="blackout"]::before {
  content: "You made the right choice.";
  display: block;
  padding: 4rem 1rem;
  font: 1rem/1.5 system-ui, sans-serif;
  color: light-dark(#1b1b1f, #ececed);
  text-align: center;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/ben/Projects/PeaceBeStill && node --test extensions/linkedin/test/hide-css.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/ben/Projects/PeaceBeStill
git add extensions/linkedin/src/hide.css extensions/linkedin/test/hide-css.test.mjs
git commit -m "Draw the blackout page

The one rule in the family allowed to do more than hide, so the test names it
rather than widening what any rule may declare. It touches no LinkedIn markup,
which is why it needs no separate mobile version."
```

---

### Task 3: the options page

**Files:**
- Create: `extensions/linkedin/src/options.html`, `extensions/linkedin/src/options.css`, `extensions/linkedin/src/options.js`
- Test: `extensions/linkedin/test/options.test.mjs`

**Interfaces:**
- Consumes: `PeaceBeStill.{GROUPS, FEATURES, KEYS, defaults, withDefaults, isDefaultValue, redundantKeys, parentOf, isMoot}` from Task 1.
- Produces: an options page bound to `storage.sync`. No exported functions; later tasks depend only on the file paths.

`options.css` is copied **verbatim** from `extensions/youtube/src/options.css` — it is generic, contains nothing YouTube-specific, and the two pages should look identical. `options.js` is the YouTube file with the `consentFor` / `permissions.request` block removed, since nothing here needs an optional data-collection permission.

- [ ] **Step 1: Write the failing test**

Create `extensions/linkedin/test/options.test.mjs`. Copy `extensions/youtube/test/options.test.mjs` and make exactly these changes:

1. Delete the final test, `"ticking the dislike count asks Firefox for the optional data-collection permission first"`, and everything it sets up — there is no such switch here.
2. Replace the body of `"a child is indented directly under its parent when they share a section"` with the test below. Blackout is the parent of everything but lives in its own group, so nothing is indented; that is the behaviour worth pinning.
3. Replace the five tests that name YouTube keys — `"a switch its parent made pointless says so…"`, `"only a switch that differs from its default is stored"`, `"settings already stored that match their default are cleaned up on load"`, `"the summary counts what is on…"` and `"the filter narrows the list…"` — with the versions below.
4. Leave `fakeDocument`, `rowsOf`, `render`, `plain`, the `options.html` structure test and the storage-failure test unchanged.

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/ben/Projects/PeaceBeStill && node --test extensions/linkedin/test/options.test.mjs`
Expected: FAIL — `ENOENT` on `extensions/linkedin/src/options.html`.

- [ ] **Step 3: Write the implementation**

Copy the stylesheet unchanged:

```bash
cd /home/ben/Projects/PeaceBeStill
cp extensions/youtube/src/options.css extensions/linkedin/src/options.css
```

Create `extensions/linkedin/src/options.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>PeaceBeStill for LinkedIn</title>
    <link rel="stylesheet" href="options.css" />
  </head>
  <body>
    <h1>PeaceBeStill <small>for LinkedIn</small></h1>
    <p id="summary"></p>
    <p id="status" role="status" aria-live="polite"></p>
    <input id="filter" type="search" placeholder="Filter switches…" aria-label="Filter switches" autocomplete="off" />
    <button id="all-off" type="button">Turn all off</button>
    <form id="features"></form>
    <script src="core.js"></script>
    <script src="options.js"></script>
  </body>
</html>
```

Create `extensions/linkedin/src/options.js` by copying `extensions/youtube/src/options.js` and making exactly these changes:

1. Delete the whole `consentFor` function and its comment block (the one beginning "The dislike count sends the video ID to a third party").
2. In the `form` change listener, delete the two lines that call it:
   ```js
       if (!(await consentFor(box))) {
         box.checked = false;
         return;
       }
   ```
3. Nothing else changes. The listener stays `async`, since `save` is awaited.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/ben/Projects/PeaceBeStill && node --test extensions/linkedin/test/options.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/ben/Projects/PeaceBeStill
git add extensions/linkedin/src/options.html extensions/linkedin/src/options.css extensions/linkedin/src/options.js extensions/linkedin/test/options.test.mjs
git commit -m "Add the LinkedIn options page

The same page as YouTube's, less the data-collection consent flow: nothing
here makes a request, so there is no permission to ask for."
```

---

### Task 4: `content.js` — the wiring

**Files:**
- Create: `extensions/linkedin/src/content.js`

**Interfaces:**
- Consumes: `PeaceBeStill.{KEYS, BLACKOUT_TITLE, tokensFor, effective, redirectFor, titleFor}` from Task 1.
- Produces: nothing other code reads. It is the only file that touches the live DOM.

Every decision this file makes is already tested in `core.js`; what is left is wiring, which the YouTube extension does not unit-test either. It is verified by hand in Task 5, once there is a manifest to load.

One wrinkle worth the code it costs: switching blackout **off** should put the tab title back. At `document_start` the title is not parsed yet, so it cannot be captured once — instead the last title LinkedIn itself set is remembered as it goes past.

- [ ] **Step 1: Write the implementation**

Create `extensions/linkedin/src/content.js`:

```js
// Runs at document_start on linkedin.com. Keeps the root element's
// data-peacebestill attribute equal to the enabled feature keys -- hide.css does
// the hiding, and for blackout the drawing -- sends the home page elsewhere
// when asked, and keeps the tab title in step with both.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { KEYS, BLACKOUT_TITLE, tokensFor, effective, redirectFor, titleFor } = globalThis.PeaceBeStill;

  // What storage holds, and what that means once defaults are filled in and
  // anything blackout has made moot is forced off. Only `settings` is ever
  // read, and every read tests for truth: storage keeps only values that
  // differ from a default, so an absent key means off and must never be
  // mistaken for on.
  let stored = {};
  let settings = effective(stored);

  // The last title LinkedIn set for itself. Captured as it goes past rather
  // than once at startup, because at document_start the title has not been
  // parsed yet. Switching blackout off puts this back, so the tab stops saying
  // our sentence without waiting for the next navigation.
  let siteTitle = "";

  function apply() {
    document.documentElement.dataset.peacebestill = tokensFor(settings);
  }

  function keepTitle() {
    if (document.title && document.title !== BLACKOUT_TITLE) siteTitle = document.title;
    if (!settings.blackout && document.title === BLACKOUT_TITLE && siteTitle) document.title = siteTitle;
    const wanted = titleFor(document.title, settings);
    if (wanted !== null) document.title = wanted;
  }

  function redirectIfAsked() {
    const target = redirectFor(location.pathname, settings);
    if (!target) return false;
    location.replace(target);
    return true;
  }

  // LinkedIn is a single-page app and rewrites the title as it navigates, so
  // the title work is redone on mutation rather than set once. The observer
  // runs only while a switch needs it, and its callback is debounced so a
  // busy feed cannot starve the page.
  let observer = null;
  let observeTimer = null;

  function watchDom() {
    // Always: this is also how the title is put back when blackout goes off.
    keepTitle();
    if (!(settings.blackout || settings.notificationCount)) {
      observer?.disconnect();
      observer = null;
      return;
    }
    if (observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(observeTimer);
      observeTimer = setTimeout(keepTitle, 200);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function refresh() {
    if (redirectIfAsked()) return;
    apply();
    watchDom();
  }

  api.storage.sync.get(KEYS).then((values) => {
    stored = values;
    settings = effective(stored);
    refresh();
  }).catch(() => {
    // Storage unavailable: the defaults are off, so do nothing at all.
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    // A removal arrives as a change with no newValue: drop the key so it falls
    // back to its default rather than reading as "off".
    for (const [key, change] of Object.entries(changes)) {
      if ("newValue" in change) stored[key] = change.newValue;
      else delete stored[key];
    }
    settings = effective(stored);
    refresh();
  });
})();
```

- [ ] **Step 2: Run the whole suite to check nothing regressed**

Run: `cd /home/ben/Projects/PeaceBeStill && npm test`
Expected: PASS. `content.js` has no tests of its own; this confirms Tasks 1–3 still pass.

- [ ] **Step 3: Commit**

```bash
cd /home/ben/Projects/PeaceBeStill
git add extensions/linkedin/src/content.js
git commit -m "Wire the LinkedIn content script

Thin by design: every decision it makes lives in core.js, where it is tested.
It remembers the last title LinkedIn set so switching blackout off puts the
tab back rather than leaving our sentence there until the next navigation."
```

---

### Task 5: `manifest.json`, icons, and the npm scripts

**Files:**
- Create: `extensions/linkedin/src/manifest.json`, `extensions/linkedin/src/icons/icon.svg`, `extensions/linkedin/src/icons/icon-{16,32,48,96,128}.png`
- Test: `extensions/linkedin/test/manifest.test.mjs`
- Modify: `package.json` (the `scripts` block)

**Interfaces:**
- Consumes: `PeaceBeStill.KEYS` from Task 1; `selfHostedManifest` from `scripts/variant.mjs` (existing) — `selfHostedManifest(manifest, { repo, assets })` returns the manifest with `update_url` at both levels and a `-selfhosted` Firefox ID.
- Produces: a loadable extension. This is the first task whose deliverable can be linted and installed.

This task folds in the `package.json` scripts because `web-ext lint` cannot run until every file the manifest names exists, and the manifest is the last of them.

- [ ] **Step 1: Write the failing test**

Create `extensions/linkedin/test/manifest.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { selfHostedManifest } from "../../../scripts/variant.mjs";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

const { KEYS } = loadClassic(new URL("../src/core.js", import.meta.url)).PeaceBeStill;
const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));

test("manifest is MV3 with the agreed identity", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "PeaceBeStill - LinkedIn");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.browser_specific_settings.gecko.id, "linkedin@peacebestill.fyi");
  // 142 is the first Firefox, desktop and Android alike, that knows
  // data_collection_permissions; below it the linter warns.
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "142.0");
});

// The description is also the store summary, and it counts the switches. A
// switch added without updating it leaves both saying something untrue.
test("the description's switch count is the number of switches", () => {
  const claimed = manifest.description.match(/(\d+) switches/);
  assert.ok(claimed, `description should state a switch count: ${manifest.description}`);
  assert.equal(Number(claimed[1]), KEYS.length);
});

test("manifest asks for nothing beyond storage and linkedin.com", () => {
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts.map((c) => c.matches), [["*://www.linkedin.com/*"]]);
  assert.equal(manifest.background, undefined);
});

test("content script loads the core before the script that uses it, at document_start", () => {
  const [cs] = manifest.content_scripts;
  assert.deepEqual(cs.js, ["core.js", "content.js"]);
  assert.deepEqual(cs.css, ["hide.css"]);
  assert.equal(cs.run_at, "document_start");
});

// Firefox for Android needs an explicit opt-in; without gecko_android AMO
// lists the add-on as desktop-only and Android never offers it. Unlike the
// YouTube extension there is no separate mobile host to match: LinkedIn serves
// its mobile web from www.linkedin.com, and every v1 switch is CSS on body,
// URL logic or title logic, so none of them depends on the markup anyway.
test("opts in to Firefox for Android", () => {
  assert.deepEqual(manifest.browser_specific_settings.gecko_android, { strict_min_version: "142.0" });
});

// Every other extension in this family has an outbound request to declare.
// This one has none at all, and the manifest has to say so.
test("declares data collection: none required, and nothing optional", () => {
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, { required: ["none"] });
});

test("icons are declared at every size a browser asks for, and the files exist", () => {
  const sizes = ["16", "32", "48", "96", "128"];
  assert.deepEqual(Object.keys(manifest.icons ?? {}), sizes);
  for (const size of sizes) {
    assert.equal(manifest.icons[size], `icons/icon-${size}.png`);
    const file = new URL(`../src/${manifest.icons[size]}`, import.meta.url);
    assert.ok(statSync(file).size > 0, `icons/icon-${size}.png is missing or empty`);
  }
});

// The source tree is what both stores get, and each of them rejects a package
// that names its own update service. The self-hosted build adds the two keys
// back, pointed at the constant latest-release assets.
test("the source manifest names no update service, and the self-hosted build adds ours", () => {
  assert.equal(manifest.update_url, undefined);
  assert.equal(manifest.browser_specific_settings.gecko.update_url, undefined);

  const base = "https://github.com/nascosto/PeaceBeStill/releases/latest/download/";
  const selfHosted = selfHostedManifest(manifest, { repo: "nascosto/PeaceBeStill", assets: "peacebestill-linkedin" });
  assert.equal(selfHosted.browser_specific_settings.gecko.update_url, base + "peacebestill-linkedin-updates.json");
  assert.equal(selfHosted.update_url, base + "peacebestill-linkedin-updates.xml");
  assert.equal(selfHosted.browser_specific_settings.gecko.id, "linkedin-selfhosted@peacebestill.fyi");
});

test("its version is the repo's version, which is what the release guard demands", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, pkg.version);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/ben/Projects/PeaceBeStill && node --test extensions/linkedin/test/manifest.test.mjs`
Expected: FAIL — `ENOENT` on `extensions/linkedin/src/manifest.json`.

- [ ] **Step 3: Draw the icon and render the PNGs**

The family mark is one swell that gives up its motion and lies flat. Each extension keeps the mark and changes the ground, so they read as a set without being mistaken for each other. YouTube's ground is `#15788f`; LinkedIn's is a deep blue, `#1d4e89` — deliberately not LinkedIn's own brand blue.

Create `extensions/linkedin/src/icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="PeaceBeStill">
  <!-- One swell, then stillness: the wave gives up its motion and lies flat. -->
  <rect width="128" height="128" rx="30" fill="#1d4e89"/>
  <path d="M13 86 C23 42 45 42 55 71 L115 71"
        fill="none" stroke="#ffffff" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Render the five PNGs (ImageMagick is installed as `magick`; it renders this SVG correctly):

```bash
cd /home/ben/Projects/PeaceBeStill/extensions/linkedin/src/icons
for size in 16 32 48 96 128; do
  magick -background none icon.svg -resize "${size}x${size}" -depth 8 "icon-${size}.png"
done
identify icon-*.png
```

Expected: five files, each `PNG <size>x<size> 8-bit sRGB`.

- [ ] **Step 4: Write the manifest**

Create `extensions/linkedin/src/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "PeaceBeStill - LinkedIn",
  "version": "1.0.0",
  "description": "Make LinkedIn \"Be Still\". Fully configurable with 5 switches.",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png",
    "128": "icons/icon-128.png"
  },
  "permissions": [
    "storage"
  ],
  "content_scripts": [
    {
      "matches": [
        "*://www.linkedin.com/*"
      ],
      "css": [
        "hide.css"
      ],
      "js": [
        "core.js",
        "content.js"
      ],
      "run_at": "document_start"
    }
  ],
  "options_ui": {
    "page": "options.html",
    "open_in_tab": false
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "linkedin@peacebestill.fyi",
      "strict_min_version": "142.0",
      "data_collection_permissions": {
        "required": [
          "none"
        ]
      }
    },
    "gecko_android": {
      "strict_min_version": "142.0"
    }
  },
  "minimum_chrome_version": "120"
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/ben/Projects/PeaceBeStill && node --test extensions/linkedin/test/manifest.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 6: Add the npm scripts**

Edit `package.json`'s `scripts` block. Replace the `lint`, `build`, `start:firefox` and `start:chromium` entries and add the LinkedIn ones, so the block reads:

```json
    "test": "node --test test/*.test.mjs extensions/*/test/*.test.mjs",
    "lint": "npm run lint:youtube && npm run lint:linkedin",
    "lint:youtube": "web-ext lint --source-dir extensions/youtube/src",
    "lint:linkedin": "web-ext lint --source-dir extensions/linkedin/src",
    "build": "npm run build:youtube && npm run build:linkedin",
    "build:youtube": "npm run build:youtube:store && npm run build:youtube:selfhosted",
    "build:youtube:store": "web-ext build --source-dir extensions/youtube/src --artifacts-dir dist --overwrite-dest --filename peacebestill-youtube-store.zip",
    "build:youtube:selfhosted": "node scripts/variant.mjs --src extensions/youtube/src --out dist/self-hosted/youtube --assets peacebestill-youtube && web-ext build --source-dir dist/self-hosted/youtube --artifacts-dir dist --overwrite-dest --filename peacebestill-youtube.zip",
    "build:linkedin": "npm run build:linkedin:store && npm run build:linkedin:selfhosted",
    "build:linkedin:store": "web-ext build --source-dir extensions/linkedin/src --artifacts-dir dist --overwrite-dest --filename peacebestill-linkedin-store.zip",
    "build:linkedin:selfhosted": "node scripts/variant.mjs --src extensions/linkedin/src --out dist/self-hosted/linkedin --assets peacebestill-linkedin && web-ext build --source-dir dist/self-hosted/linkedin --artifacts-dir dist --overwrite-dest --filename peacebestill-linkedin.zip",
    "bump": "node scripts/bump.mjs",
    "start:firefox:youtube": "web-ext run --source-dir extensions/youtube/src --start-url https://www.youtube.com",
    "start:chromium:youtube": "web-ext run --source-dir extensions/youtube/src --target chromium --start-url https://www.youtube.com",
    "start:firefox:linkedin": "web-ext run --source-dir extensions/linkedin/src --start-url https://www.linkedin.com",
    "start:chromium:linkedin": "web-ext run --source-dir extensions/linkedin/src --target chromium --start-url https://www.linkedin.com",
    "audit:chromium": "node extensions/youtube/audit/chromium.mjs",
    "audit:firefox": "node extensions/youtube/audit/firefox.mjs",
    "audit:mobile": "node extensions/youtube/audit/mobile.mjs"
```

Note there are deliberately **no** `audit:*` scripts for LinkedIn: its pages are behind a login, so the live-page audit that keeps YouTube's selectors honest cannot exist. Task 7 documents that in the README so the absence does not read as an oversight.

- [ ] **Step 7: Run the full suite, the linter and a build**

```bash
cd /home/ben/Projects/PeaceBeStill
npm test
npm run lint
npm run build:linkedin
```

Expected: tests PASS; `web-ext lint` reports no errors for either extension; `dist/peacebestill-linkedin-store.zip`, `dist/peacebestill-linkedin.zip` and `dist/self-hosted/linkedin/` are written, and the last line of the variant step prints `(id linkedin-selfhosted@peacebestill.fyi)`.

- [ ] **Step 8: Verify it by hand in Firefox**

This is the only verification LinkedIn gets — there are no audits — so do it properly.

```bash
cd /home/ben/Projects/PeaceBeStill && npm run start:firefox:linkedin
```

Or, to use a signed-in profile: Firefox → `about:debugging` → This Firefox → Load Temporary Add-on → `extensions/linkedin/src/manifest.json`.

Check each of these, and record the result:

1. **Fresh install changes nothing.** LinkedIn looks exactly as it did. `about:debugging` → Inspect → Storage → Extension storage is empty.
2. **Blackout.** Tick "Replace LinkedIn with a better idea". Every open LinkedIn tab becomes the sentence, at ordinary body size, without a reload. The tab title reads "You made the right choice."
3. **Blackout covers the whole site.** Visit `/feed/`, `/messaging/`, `/notifications/`, `/jobs/`, a profile URL and a search URL. Every one is the sentence.
4. **Dark mode.** With the OS or Firefox set to dark, the text is light on a dark ground; in light mode, dark on light. Toggle and re-check.
5. **Blackout locks the rest.** On the options page every other switch is greyed, keeps its tick, is still reachable by Tab, refuses a click, and says "no effect while 'Replace LinkedIn with a better idea' is on".
6. **Turning it off restores everything**, including the tab title, and any switch that was ticked before is ticked still.
7. **Redirects.** With blackout off, tick "Open Messaging instead of the home feed" and visit `linkedin.com` — it lands on `/messaging/`. `/jobs/` and a profile URL are untouched. Tick Notifications as well: the home page still goes to Messaging (first in table order).
8. **Unread count.** With "Hide the unread count in the tab title" on and unread notifications waiting, the tab reads "Feed | LinkedIn" rather than "(3) Feed | LinkedIn", and stays that way after navigating within LinkedIn.
9. **No requests.** Open the Network panel, exercise every switch, and confirm the extension itself issues nothing.

- [ ] **Step 9: Verify it on Firefox for Android**

Install the same way on a phone or emulator (`about:debugging` over USB, or a temporary add-on). Confirm blackout, both redirects and the tab title behave exactly as on the desktop. They should: none of the five switches touches LinkedIn's markup.

- [ ] **Step 10: Commit**

```bash
cd /home/ben/Projects/PeaceBeStill
git add extensions/linkedin/src/manifest.json extensions/linkedin/src/icons extensions/linkedin/test/manifest.test.mjs package.json
git commit -m "Make the LinkedIn extension installable

Manifest, icons, and the npm scripts for a second extension. The unprefixed
start:* scripts become per-extension ones, since there are now two. No audit
script: LinkedIn is behind a login, so there is no signed-out page to drive."
```

---

### Task 6: the release pipeline

**Files:**
- Modify: `.github/workflows/release.yml`, `.github/workflows/publish-stores.yml`

**Interfaces:**
- Consumes: `scripts/check-version.mjs` (takes a tag then one or more extension source dirs), `scripts/pack-crx.mjs` (`--key`, `--zip`, `--out`), `scripts/update-manifests.mjs` (`--repo --tag --key --src --assets --out`), `scripts/publish-cws.mjs` (`--item`, `--zip`).
- Produces: eight release assets per tag, four per extension.

Each store step is gated on its own repository **variable**, not on credentials — the credentials are shared across extensions and their presence says nothing about whether a listing exists. LinkedIn is Firefox-first, so `LINKEDIN_CWS_ITEM_ID` will be unset for a while and its step will skip; that is the designed behaviour, not a failure.

- [ ] **Step 1: Extend `release.yml`**

Make these edits to `.github/workflows/release.yml`:

1. In the job's `env` block, add the two LinkedIn gates below the YouTube ones:

```yaml
      LINKEDIN_AMO_SLUG: ${{ vars.LINKEDIN_AMO_SLUG }}
      LINKEDIN_CWS_ITEM_ID: ${{ vars.LINKEDIN_CWS_ITEM_ID }}
```

2. Add the new extension to the version guard:

```yaml
      - name: The tag must match every extension's manifest version
        run: node scripts/check-version.mjs "$GITHUB_REF_NAME" extensions/youtube/src extensions/linkedin/src
```

3. After the existing "Sign the self-hosted build" step, add its LinkedIn twin. `web-ext sign` writes into `dist`, and the YouTube step has already moved its own XPI aside, so the glob picks up only this one:

```yaml
      - name: Sign the self-hosted LinkedIn build (Mozilla's unlisted channel)
        env:
          WEB_EXT_API_KEY: ${{ secrets.AMO_JWT_ISSUER }}
          WEB_EXT_API_SECRET: ${{ secrets.AMO_JWT_SECRET }}
        run: |
          npx web-ext sign --source-dir dist/self-hosted/linkedin \
            --artifacts-dir dist --channel unlisted
          mv dist/*.xpi dist/peacebestill-linkedin.xpi
```

4. After the existing "Pack the CRX and write the update manifests" step, add:

```yaml
      - name: Pack the LinkedIn CRX and write its update manifests
        env:
          LINKEDIN_CRX_PRIVATE_KEY: ${{ secrets.LINKEDIN_CRX_PRIVATE_KEY }}
        run: |
          printf '%s\n' "$LINKEDIN_CRX_PRIVATE_KEY" > "$RUNNER_TEMP/linkedin.pem"
          node scripts/pack-crx.mjs --key "$RUNNER_TEMP/linkedin.pem" \
            --zip dist/peacebestill-linkedin.zip --out dist/peacebestill-linkedin.crx
          node scripts/update-manifests.mjs --repo "$GITHUB_REPOSITORY" --tag "$GITHUB_REF_NAME" \
            --key "$RUNNER_TEMP/linkedin.pem" --src dist/self-hosted/linkedin \
            --assets peacebestill-linkedin --out dist
          rm -f "$RUNNER_TEMP/linkedin.pem"
```

5. Extend the release creation to carry all eight assets:

```yaml
      - name: Create the release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "$GITHUB_REF_NAME" \
            dist/peacebestill-youtube.xpi dist/peacebestill-youtube.crx \
            dist/peacebestill-youtube-updates.json dist/peacebestill-youtube-updates.xml \
            dist/peacebestill-linkedin.xpi dist/peacebestill-linkedin.crx \
            dist/peacebestill-linkedin-updates.json dist/peacebestill-linkedin-updates.xml \
            --title "$GITHUB_REF_NAME" \
            --notes "PeaceBeStill $GITHUB_REF_NAME. Also on addons.mozilla.org and the Chrome Web Store; the assets below are the self-hosted copies, which system-setups' browser policies fetch."
```

6. After the two YouTube store steps, add the two LinkedIn ones:

```yaml
      - name: Submit LinkedIn to addons.mozilla.org (listed)
        if: env.AMO_JWT_ISSUER != '' && env.LINKEDIN_AMO_SLUG != ''
        env:
          WEB_EXT_API_KEY: ${{ secrets.AMO_JWT_ISSUER }}
          WEB_EXT_API_SECRET: ${{ secrets.AMO_JWT_SECRET }}
        run: |
          npx web-ext sign --source-dir extensions/linkedin/src \
            --artifacts-dir dist/amo --channel listed

      - name: Publish LinkedIn to the Chrome Web Store
        if: env.CWS_CLIENT_ID != '' && env.LINKEDIN_CWS_ITEM_ID != ''
        env:
          CWS_CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
          CWS_CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
          CWS_REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
        run: |
          node scripts/publish-cws.mjs --item "$LINKEDIN_CWS_ITEM_ID" \
            --zip dist/peacebestill-linkedin-store.zip
```

- [ ] **Step 2: Extend `publish-stores.yml`**

This workflow republishes an already-tagged version to whichever stores are configured. Its `Build the store package` step runs `npm run build`, which after Task 5 builds both extensions, so it needs no change. Make these four edits:

1. Add the two gates to the job's `env` block, below the YouTube ones:

```yaml
      LINKEDIN_AMO_SLUG: ${{ vars.LINKEDIN_AMO_SLUG }}
      LINKEDIN_CWS_ITEM_ID: ${{ vars.LINKEDIN_CWS_ITEM_ID }}
```

2. Widen the "at least one store has to be configured" guard, so a dispatch that would publish only LinkedIn is not refused. It must fail only when *no* extension is configured for *either* store:

```yaml
      - name: At least one store has to be configured
        if: (env.AMO_JWT_ISSUER == '' || (env.YOUTUBE_AMO_SLUG == '' && env.LINKEDIN_AMO_SLUG == '')) && (env.CWS_CLIENT_ID == '' || (env.YOUTUBE_CWS_ITEM_ID == '' && env.LINKEDIN_CWS_ITEM_ID == ''))
        run: |
          echo "::error::No store credentials are set, so this run would publish nothing."
          exit 1
```

3. Add the new extension to the version guard:

```yaml
      - name: The tag must match every extension's manifest version
        run: node scripts/check-version.mjs "${{ inputs.tag }}" extensions/youtube/src extensions/linkedin/src
```

4. After the two existing store steps, add LinkedIn's:

```yaml
      - name: Submit LinkedIn to addons.mozilla.org (listed)
        if: env.AMO_JWT_ISSUER != '' && env.LINKEDIN_AMO_SLUG != ''
        env:
          WEB_EXT_API_KEY: ${{ secrets.AMO_JWT_ISSUER }}
          WEB_EXT_API_SECRET: ${{ secrets.AMO_JWT_SECRET }}
        run: |
          npx web-ext sign --source-dir extensions/linkedin/src \
            --artifacts-dir dist/amo --channel listed

      - name: Publish LinkedIn to the Chrome Web Store
        if: env.CWS_CLIENT_ID != '' && env.LINKEDIN_CWS_ITEM_ID != ''
        env:
          CWS_CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
          CWS_CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
          CWS_REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
        run: |
          node scripts/publish-cws.mjs --item "$LINKEDIN_CWS_ITEM_ID" \
            --zip dist/peacebestill-linkedin-store.zip
```

- [ ] **Step 3: Check both workflows parse**

```bash
cd /home/ben/Projects/PeaceBeStill
python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.github/workflows/release.yml','.github/workflows/publish-stores.yml']]; print('both parse')"
node scripts/check-version.mjs v1.0.0 extensions/youtube/src extensions/linkedin/src
```

Expected: `both parse`, then `tag v1.0.0 matches package.json, extensions/youtube/src/manifest.json, extensions/linkedin/src/manifest.json`.

- [ ] **Step 4: Dry-run the self-hosted pipeline locally**

This is worth doing before tagging, because the CRX and update-manifest steps are the parts no test covers. Generate a throwaway key — **not** the real one, which Task 8 covers:

```bash
cd /home/ben/Projects/PeaceBeStill
TMP=$(mktemp -d)
openssl genrsa -out "$TMP/throwaway.pem" 2048 2>/dev/null
npm run build:linkedin
node scripts/pack-crx.mjs --key "$TMP/throwaway.pem" --zip dist/peacebestill-linkedin.zip --out "$TMP/peacebestill-linkedin.crx"
node scripts/update-manifests.mjs --repo nascosto/PeaceBeStill --tag v1.0.0 \
  --key "$TMP/throwaway.pem" --src dist/self-hosted/linkedin --assets peacebestill-linkedin --out "$TMP"
cat "$TMP/peacebestill-linkedin-updates.json"
cat "$TMP/peacebestill-linkedin-updates.xml"
rm -rf "$TMP"
```

Expected: the CRX is written; the JSON names `linkedin-selfhosted@peacebestill.fyi` with a `peacebestill-linkedin.xpi` link; the XML names a 32-letter Chromium ID with a `peacebestill-linkedin.crx` codebase. Both point at `releases/download/v1.0.0/`.

- [ ] **Step 5: Commit**

```bash
cd /home/ben/Projects/PeaceBeStill
git add .github/workflows/release.yml .github/workflows/publish-stores.yml
git commit -m "Release the LinkedIn extension alongside the YouTube one

Eight assets a tag now. Each store step is gated on its own listing variable,
so LinkedIn ships to Firefox first and starts publishing to Chrome the day
that listing exists."
```

---

### Task 7: README and PRIVACY

**Files:**
- Modify: `README.md`, `PRIVACY.md`

**Interfaces:** none — documentation only. It is its own task because a reviewer can reasonably reject the prose while accepting the code.

`PRIVACY.md` currently reads as though YouTube is the only extension: it has a section called "The one network request" and says the permissions are a content script on `www.youtube.com`. It is linked from both store listings, so it has to be true of both extensions.

- [ ] **Step 1: Update the README**

1. Add a row to the extensions table under the intro:

```markdown
| PeaceBeStill - LinkedIn | www.linkedin.com | [`extensions/linkedin`](extensions/linkedin) |
```

2. Add a `## PeaceBeStill - LinkedIn` section after the YouTube one:

```markdown
## PeaceBeStill - LinkedIn

Five switches so far, and the first one is the blunt one.

- **Replace LinkedIn with a better idea** — every page on the site becomes one
  line of ordinary text reading "You made the right choice." It is the whole
  site, with no exceptions; to use LinkedIn again you turn it off. While it is
  on, every other switch is greyed out and says so, because none of them can
  matter when there is no page left to act on.
- send the home page to Messaging, Notifications or Jobs instead of the feed
  (with more than one on, the first of those three wins)
- hide the unread count LinkedIn puts in front of the tab title

Every one of them works on Firefox for Android exactly as on the desktop:
none touches LinkedIn's markup, so there is no mobile version to write.

### Why there are no audits here

The YouTube extension checks its selectors by driving a signed-out headless
browser through live pages. LinkedIn puts essentially everything behind a
login, so that audit cannot exist, and `extensions/linkedin` has no `audit/`
directory and no `audit:*` script. This is deliberate, not an omission.

Two consequences worth knowing. Switches are added one page at a time, from
markup read by hand in a signed-in browser, and that markup is never committed
here in any form — this repository is public, and a signed-in LinkedIn page
carries real names and profile identifiers. And when LinkedIn changes its
markup a switch stops working silently; the fix is to look at the page again
and correct the rule.

None of that applies to the five switches above, which use no selectors at all.
```

3. In `## Developing`, update the run commands to the per-extension names:

```
    npm run start:firefox:youtube      # throwaway profile with that extension loaded
    npm run start:chromium:youtube
    npm run start:firefox:linkedin
    npm run start:chromium:linkedin
```

Check the rest of that section for any other reference to `start:firefox` or `start:chromium` and to `extensions/youtube/src` as *the* extension to load; make them per-extension too.

4. In `## Releasing`, add LinkedIn's four constant URLs beneath YouTube's:

```
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-linkedin.xpi
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-linkedin.crx
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-linkedin-updates.json
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-linkedin-updates.xml
```

The four-channel table in that section is written for one extension; give it a
LinkedIn counterpart or generalise it to `<extension>@peacebestill.fyi`, whichever
reads better against the surrounding prose.

5. In `### First listing on each store, by hand`, note that LinkedIn's variables are `LINKEDIN_AMO_SLUG` and `LINKEDIN_CWS_ITEM_ID`, and that its listing answers the data-use questions with **no** outbound requests at all — simpler than YouTube's, which has the dislike count to declare.

6. In `### Secrets`, add the row and extend the variables line:

```markdown
| `LINKEDIN_CRX_PRIVATE_KEY` | the PEM generated below; the self-hosted Chromium ID is derived from it, so it must never change |
```

and update the key-generation snippet to show both:

```
    mkdir -p ~/.config/peacebestill
    openssl genrsa -out ~/.config/peacebestill/youtube-crx-key.pem 2048
    openssl genrsa -out ~/.config/peacebestill/linkedin-crx-key.pem 2048
    node scripts/pack-crx.mjs --key ~/.config/peacebestill/linkedin-crx-key.pem --id   # the Chromium ID
```

- [ ] **Step 2: Restructure PRIVACY.md**

Keep the opening promise as it stands (it is true of every extension). Then:

1. Retitle "The one network request" to **"Network requests"**, and make it per-extension:

```markdown
## Network requests

**PeaceBeStill - LinkedIn** makes none, in any configuration. Every switch
works inside the page.

**PeaceBeStill - YouTube** makes none either, except **Show the dislike
count**, which is off until you turn it on.
```

Keep the existing paragraphs about the Return YouTube Dislike API beneath that, unchanged.

2. Make the "Permissions" section per-extension:

```markdown
## Permissions

Each extension asks for `storage`, to keep your settings, and a content script
on its own site — `www.youtube.com` for one, `www.linkedin.com` for the other.
There are no host permissions for any other site, no `tabs`, no `history`, and
no background script. Neither extension can see any page but its own site, and
neither reads your account or your activity on it.
```

- [ ] **Step 3: Check the docs against the code**

```bash
cd /home/ben/Projects/PeaceBeStill
grep -n 'start:firefox\b\|start:chromium\b' README.md package.json     # expect no bare, unprefixed names
npm test && npm run lint
```

Expected: no bare `start:firefox` / `start:chromium`; tests and lint pass.

- [ ] **Step 4: Commit**

```bash
cd /home/ben/Projects/PeaceBeStill
git add README.md PRIVACY.md
git commit -m "Document the LinkedIn extension

Including why it has no audits, which is the part a reader would otherwise
take for an oversight. PRIVACY.md was written when there was one extension
with one outbound request; both stores link it, so it had to stop implying
that YouTube is all there is."
```

---

### Task 8: release, by hand

**Files:** none. These steps need credentials and a browser session, so they are the user's to run.

- [ ] **Step 1: Generate the Chromium signing key**

Do this even though Chrome comes later: it is one command, the key never expires, and it keeps the release job a straight copy of the YouTube block rather than a conditional one.

```bash
mkdir -p ~/.config/peacebestill
openssl genrsa -out ~/.config/peacebestill/linkedin-crx-key.pem 2048
cd /home/ben/Projects/PeaceBeStill
node scripts/pack-crx.mjs --key ~/.config/peacebestill/linkedin-crx-key.pem --id
```

Keep the printed ID — it is the self-hosted Chromium extension ID, and it is derived from this key, so the key must never change or be lost. `.gitignore` already excludes `*.pem`.

- [ ] **Step 2: Add the repository secret**

GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret:
`LINKEDIN_CRX_PRIVATE_KEY`, with the full contents of `~/.config/peacebestill/linkedin-crx-key.pem` including the BEGIN and END lines.

- [ ] **Step 3: Tag a release**

```bash
cd /home/ben/Projects/PeaceBeStill
npm run bump minor       # both manifests and package.json move together
git commit -am "Release 1.1.0"
git tag v1.1.0 && git push origin main v1.1.0
```

Then confirm the release carries eight assets, and that `peacebestill-linkedin-updates.json` names `linkedin-selfhosted@peacebestill.fyi` and `peacebestill-linkedin-updates.xml` names the ID from Step 1.

- [ ] **Step 4: Create the AMO listing**

Submit `dist/peacebestill-linkedin-store.zip` to addons.mozilla.org as a **listed** add-on, with <contact@peacebestill.fyi> as the contact and the repo's `PRIVACY.md` as the privacy policy. Answer the data-use questions with "no data collected" — this extension makes no requests at all. Then set the repository **variable** `LINKEDIN_AMO_SLUG` to the listing's slug, and dispatch the **publish-stores** workflow for `v1.1.0` so the version already shipped reaches the listing.

- [ ] **Step 5: Chrome, when you get to it**

Create the Chrome Web Store item, set the repository variable `LINKEDIN_CWS_ITEM_ID`, and dispatch **publish-stores** for the current tag. Until then that step skips itself, which is the intended state.

---

## Afterwards: adding switches

Each further switch follows the same loop, one page at a time:

1. Paste the page's markup into a working session. It is read there and never written to this repo.
2. Add rows to `FEATURES` in `core.js` and the matching key to `DEFAULTS` in `core.test.mjs`; add a group to `GROUPS` only when a page needs one, since `options.js` draws a fieldset per declared group and an empty one shows as an empty box.
3. Add the rules to `hide.css`, gated on the new keys. `hide-css.test.mjs` will fail until every non-script key has a gate.
4. Update the manifest description's switch count — `manifest.test.mjs` fails otherwise.
5. Check it in a signed-in browser: the switch hides exactly its target and nothing beside it, and toggling reaches an open tab without a reload.
6. Commit that page's switches on their own.
