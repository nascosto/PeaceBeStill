# PeaceBeStill - YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tiny Manifest V3 extension for Firefox and Chromium that hides eight things on desktop YouTube behind per-feature switches, opens the video description, and can show the dislike count, released from a public GitHub repo as signed assets that `system-setups` installs everywhere through its browser policies.

**Architecture:** One static content script + stylesheet gated on a `data-peacebestill` attribute the script keeps on `<html>`; an options page that writes `storage.sync`; no background script. Release tooling is three small Node scripts (CRX packing with built-in crypto, update manifests, tag/version check) driven by one GitHub Actions workflow that signs through Mozilla's self-distribution channel and attaches four constant-named assets to a GitHub release.

**Tech Stack:** Plain JS/CSS/HTML extension files under `src/`; Node 24 (`node --test`, `node:crypto`) for tests and scripts; `web-ext` (dev dependency, via npm + `package-lock.json`) for lint, build, run, sign; GitHub Actions + `gh` for releases.

> Written while the project was called YouTube Tidy and laid out with a
> single `src/`. It was renamed to PeaceBeStill and moved to
> `extensions/youtube/` on 2026-09-07; names and paths here have been updated
> to match, so it still reads against the current tree.

**Spec:** `docs/superpowers/specs/2026-09-02-peacebestill-youtube-design.md`

## Global Constraints

- Firefox ID is exactly `youtube@peacebestill.fyi`; extension name is `PeaceBeStill - YouTube`; first version is `1.0.0`.
- Public repo is `nascosto/PeaceBeStill`; asset names are constant: `peacebestill-youtube.xpi`, `peacebestill-youtube.crx`, `updates.json`, `updates.xml`; "latest" URLs are `https://github.com/nascosto/PeaceBeStill/releases/latest/download/<asset>`; per-release URLs are `https://github.com/nascosto/PeaceBeStill/releases/download/<tag>/<asset>`.
- Feature keys, in this order, everywhere: `create`, `moreFromYoutube`, `subscriptionDots`, `expandDescription`, `descriptionChannelLinks`, `descriptionCards`, `descriptionChips`, `footer`, `ask`, `summary`, `upcoming`, `channelTabs`, `channelTabRedirect`, `stalePlaceholders`, `titleCase`, `dislikeCount`, plus the 26 Unhook ports listed in the spec. A key missing from storage means that feature's default: **on** for all but `dislikeCount`, which is **off**.
- `dislikeCount` fetches `https://returnyoutubedislikeapi.com/votes?videoId=<id>` (JSON with a `dislikes` number; the service sends `Access-Control-Allow-Origin: *`, verified 2026-09-02). With it off the extension makes no network requests.
- The manifest declares `browser_specific_settings.gecko.data_collection_permissions` as `{ "required": ["none"], "optional": ["browsingActivity"] }` (Mozilla requires the declaration in new extensions). Ticking `dislikeCount` on the options page requests that optional data-collection permission in Firefox (`permissions.request({ data_collection: ["browsingActivity"] })`; Chromium has no such API and skips it) and unticks itself if declined.
- `titleCase` is the one feature that keeps a `MutationObserver` running (debounced 200 ms, disconnected when off); it edits text nodes only.
- Firefox `strict_min_version` is `142.0`: the first Firefox, desktop and Android alike, that knows `data_collection_permissions`, so lint is warning-free (MV3 and CSS `:has()` need less).
- Only `storage` in `permissions`; the content script matches `*://www.youtube.com/*` only; no `host_permissions`.
- No icons in 1.0.0 (both browsers fall back to a default icon); no background script; no bundler.
- Secrets (set by Ben in the public repo, never committed): `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`, `YOUTUBE_CRX_PRIVATE_KEY`. The CRX key lives locally at `~/.config/peacebestill/youtube-crx-key.pem`, outside the repo.
- Commit after every task with the trailers `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_013WyRMaKvftCxvgV2KCEt2R`.
- Nothing is signed or uploaded before Task 5 (the audit) is complete.

## File Structure

```
src/manifest.json          extension manifest (both browsers)
src/core.js           feature list with defaults, tokensFor(), formatCount(), videoIdFrom() — classic script, one global `PeaceBeStill`
src/content.js             applies tokens to <html>, expands the description, shows the dislike count
src/hide.css               one hiding rule per hiding feature, gated on html[data-peacebestill~="key"]
src/options.html/.js/.css  one checkbox per feature bound to storage.sync
scripts/pack-crx.mjs       zip + RSA PEM -> CRX3; --id prints the extension ID
scripts/update-manifests.mjs  writes updates.json (Firefox) and updates.xml (Chromium) for a release
scripts/check-version.mjs  fails unless the tag equals v<manifest version>
test/*.test.mjs            node --test files, one per unit above; test/helpers/load-classic.mjs runs classic scripts in a vm
.github/workflows/ci.yml   test + lint on push/PR
.github/workflows/release.yml  sign, pack, manifests, GitHub release on a v* tag
README.md                  what it is, dev loop, audit, release, secrets
```

---

### Task 1: Scaffold and manifest

**Files:**
- Create: `package.json`, `.gitignore`, `src/manifest.json`, `test/manifest.test.mjs`

**Interfaces:**
- Produces: `src/manifest.json` with `version` (read by Tasks 7 and 8) and `browser_specific_settings.gecko.id`.
- Produces: npm scripts `test`, `lint`, `build`, `start:firefox`, `start:chromium`.

- [ ] **Step 1: Write the failing test**

`test/manifest.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));

test("manifest is MV3 with the agreed identity", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "PeaceBeStill - YouTube");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.browser_specific_settings.gecko.id, "youtube@peacebestill.fyi");
  // 142 is the first Firefox, desktop and Android alike, that knows
  // data_collection_permissions; below it the linter warns.
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "142.0");
});

test("manifest asks for nothing beyond storage and youtube.com", () => {
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts.map((c) => c.matches), [["*://www.youtube.com/*"]]);
  assert.equal(manifest.background, undefined);
});

test("content script loads the core before the script that uses it, at document_start", () => {
  const [cs] = manifest.content_scripts;
  assert.deepEqual(cs.js, ["tidy-core.js", "content.js"]);
  assert.deepEqual(cs.css, ["tidy.css"]);
  assert.equal(cs.run_at, "document_start");
});

test("declares data collection: none required, browsing activity optional (the dislike count)", () => {
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, {
    required: ["none"],
    optional: ["browsingActivity"],
  });
});

test("update URLs point at the constant latest-release assets", () => {
  const base = "https://github.com/nascosto/PeaceBeStill/releases/latest/download/";
  assert.equal(manifest.browser_specific_settings.gecko.update_url, base + "updates.json");
  assert.equal(manifest.update_url, base + "updates.xml");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/manifest.test.mjs`
Expected: FAIL with `ENOENT ... src/manifest.json`.

- [ ] **Step 3: Write the manifest, package.json, .gitignore**

`src/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "PeaceBeStill - YouTube",
  "version": "1.0.0",
  "description": "Hides the bits of YouTube you never use and opens the description for you. Each one is a switch.",
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": ["*://www.youtube.com/*"],
      "css": ["tidy.css"],
      "js": ["tidy-core.js", "content.js"],
      "run_at": "document_start"
    }
  ],
  "options_ui": {
    "page": "options.html",
    "open_in_tab": false
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "youtube@peacebestill.fyi",
      "strict_min_version": "142.0",
      "update_url": "https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.json",
      "data_collection_permissions": {
        "required": ["none"],
        "optional": ["browsingActivity"]
      }
    }
  },
  "update_url": "https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.xml"
}
```

`package.json` (the `web-ext` version is whatever `npm install` resolves under the machine's `min-release-age`; commit the resulting `package-lock.json`):

```json
{
  "name": "peacebestill",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Hides the bits of YouTube you never use and opens the description for you.",
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "lint": "web-ext lint --source-dir src --self-hosted",
    "build": "web-ext build --source-dir src --artifacts-dir dist --overwrite-dest --filename peacebestill-youtube.zip",
    "start:firefox": "web-ext run --source-dir src --start-url https://www.youtube.com",
    "start:chromium": "web-ext run --source-dir src --target chromium --start-url https://www.youtube.com"
  },
  "engines": { "node": ">=20" }
}
```

`.gitignore`:

```
node_modules/
dist/
web-ext-artifacts/
*.pem
*.crx
*.xpi
*.zip
```

Then: `npm install --save-dev web-ext` (adds the dependency and `package-lock.json`).

- [ ] **Step 4: Run the tests and lint**

Run: `npm test && npm run lint`
Expected: manifest tests PASS. `web-ext lint` reports exactly three errors, all `MANIFEST_CONTENT_SCRIPT_FILE_NOT_FOUND` for `core.js`, `content.js` and `hide.css`, which Tasks 2–3 create; lint is clean from Task 3 on. A `MANIFEST_UNUSED_UPDATE` notice is expected (Firefox ignores the top-level `update_url`; it is Chromium's). If lint reports an error about `update_url` itself, the `--self-hosted` flag is missing from the `lint` script.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore src/manifest.json test/manifest.test.mjs
git commit -m "Scaffold the extension: manifest, npm scripts, web-ext"
```

---

### Task 2: Feature list and pure helpers (`core.js`)

**Files:**
- Create: `src/core.js`, `test/tidy-core.test.mjs`, `test/helpers/load-classic.mjs`

**Interfaces:**
- Produces global `PeaceBeStill` with: `FEATURES: Array<[key: string, label: string, defaultOn: boolean]>`; `KEYS: string[]`; `defaults(): Record<string, boolean>`; `tokensFor(settings: Record<string, boolean> | undefined): string` (space-separated enabled keys, in `KEYS` order); `formatCount(n: unknown): string` (`1234` → `"1.2K"`, non-numbers → `""`); `videoIdFrom(search: string): string | null` (the `v` query parameter); `calmTitle(text: unknown): unknown` (an ALL-CAPS title in sentence case; anything else returned unchanged).
- Used by `content.js` (Task 3) and `options.js` (Task 4) as `globalThis.PeaceBeStill`.

- [ ] **Step 1: Write the loader helper and the failing test**

`test/helpers/load-classic.mjs` — runs a classic (non-module) script in a fresh context and returns its globals:

```js
import { readFileSync } from "node:fs";
import vm from "node:vm";

export function loadClassic(relativePath, extraGlobals = {}) {
  const src = readFileSync(new URL("../../" + relativePath, import.meta.url), "utf8");
  const context = { URLSearchParams, ...extraGlobals };
  context.globalThis = context;
  vm.runInNewContext(src, context, { filename: relativePath });
  return context;
}
```

`test/tidy-core.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "./helpers/load-classic.mjs";

const { PeaceBeStill } = loadClassic("src/core.js");
const KEYS = [
  "create", "moreFromYoutube", "subscriptionDots", "expandDescription",
  "descriptionChannelLinks", "descriptionCards", "descriptionChips", "footer", "titleCase", "dislikeCount",
];
const ON_BY_DEFAULT = KEYS.filter((k) => k !== "dislikeCount");

// PeaceBeStill comes from another vm realm, so its arrays and objects have foreign
// prototypes; copy them before strict deep-equality.
test("the feature keys are the agreed ten, in order, each with a label and a default", () => {
  assert.deepEqual([...PeaceBeStill.KEYS], KEYS);
  for (const [key, label, defaultOn] of PeaceBeStill.FEATURES) {
    assert.ok(KEYS.includes(key));
    assert.ok(label.length > 10, `label for ${key}`);
    assert.equal(typeof defaultOn, "boolean", `default for ${key}`);
  }
});

test("everything is on by default except the dislike count", () => {
  assert.deepEqual({ ...PeaceBeStill.defaults() }, { ...Object.fromEntries(KEYS.map((k) => [k, true])), dislikeCount: false });
});

test("tokensFor lists enabled keys in order; a missing key takes its default", () => {
  assert.equal(PeaceBeStill.tokensFor(undefined), ON_BY_DEFAULT.join(" "));
  assert.equal(PeaceBeStill.tokensFor({}), ON_BY_DEFAULT.join(" "));
  assert.equal(PeaceBeStill.tokensFor({ dislikeCount: true }), KEYS.join(" "));
  assert.equal(
    PeaceBeStill.tokensFor({ create: false, footer: false }),
    "moreFromYoutube subscriptionDots expandDescription descriptionChannelLinks descriptionCards descriptionChips titleCase",
  );
});

test("tokensFor ignores unknown keys and non-boolean values", () => {
  assert.equal(PeaceBeStill.tokensFor({ bogus: true, create: "yes" }), ON_BY_DEFAULT.filter((k) => k !== "create").join(" "));
});

test("formatCount is compact and safe", () => {
  const cases = [[0, "0"], [999, "999"], [1000, "1K"], [1234, "1.2K"], [12345, "12K"], [1500000, "1.5M"], [2000000000, "2B"]];
  for (const [n, expected] of cases) assert.equal(PeaceBeStill.formatCount(n), expected, String(n));
  for (const bad of [-1, NaN, Infinity, undefined, null, "12"]) assert.equal(PeaceBeStill.formatCount(bad), "");
});

test("videoIdFrom reads the v parameter", () => {
  assert.equal(PeaceBeStill.videoIdFrom("?v=jNQXAC9IVRw&t=1s"), "jNQXAC9IVRw");
  assert.equal(PeaceBeStill.videoIdFrom("?list=abc"), null);
  assert.equal(PeaceBeStill.videoIdFrom(""), null);
});

test("calmTitle rewrites a shouting title in sentence case and leaves everything else alone", () => {
  assert.equal(PeaceBeStill.calmTitle("I BUILT A PC IN 24 HOURS"), "I built a pc in 24 hours");
  assert.equal(PeaceBeStill.calmTitle("HELLO WORLD. IT WORKS? I THINK SO! i'm sure"), "Hello world. It works? I think so! I'm sure");
  assert.equal(PeaceBeStill.calmTitle("Normal Title Here"), "Normal Title Here");
  assert.equal(PeaceBeStill.calmTitle("WOW!! THIS IS INSANE. you won't believe what happened"), "WOW!! THIS IS INSANE. you won't believe what happened", "under 80 % upper case");
  assert.equal(PeaceBeStill.calmTitle("NASA"), "NASA", "too short to judge");
  assert.equal(PeaceBeStill.calmTitle(""), "");
  assert.equal(PeaceBeStill.calmTitle(undefined), undefined);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/tidy-core.test.mjs`
Expected: FAIL with `ENOENT ... src/core.js`.

- [ ] **Step 3: Write `src/core.js`**

```js
// Shared by the content script and the options page. Content scripts cannot
// be ES modules, so this is a classic script that publishes one global.
(function (root) {
  // [key, label, on by default]
  const FEATURES = [
    ["create", "Hide the Create button in the header", true],
    ["moreFromYoutube", "Hide the “More from YouTube” sidebar section", true],
    ["subscriptionDots", "Hide the new-video dot beside channels in Subscriptions", true],
    ["expandDescription", "Open the video description automatically", true],
    ["descriptionChannelLinks", "Hide the channel row at the bottom of the description", true],
    ["descriptionCards", "Hide the transcript, podcast, chapters and music cards in the description", true],
    ["descriptionChips", "Hide hashtags and link chips in the description", true],
    ["footer", "Hide the About / Press / Copyright block under the sidebar", true],
    ["titleCase", "Turn ALL-CAPS titles into sentence case", true],
    // Off by default: the count comes from the Return YouTube Dislike service,
    // which means telling a third party which video you are watching.
    ["dislikeCount", "Show the dislike count (asks returnyoutubedislike.com for each video)", false],
  ];
  const KEYS = FEATURES.map(([key]) => key);

  function defaults() {
    return Object.fromEntries(FEATURES.map(([key, , defaultOn]) => [key, defaultOn]));
  }

  // Settings -> the value of the root element's data-peacebestill attribute: the
  // enabled keys, space separated, so tidy.css can gate on ~="key". A key that
  // is missing from storage takes its default, so a feature added in a later
  // version behaves the same for everyone who already installed the extension.
  function tokensFor(settings) {
    const merged = { ...defaults(), ...(settings || {}) };
    return KEYS.filter((key) => merged[key] === true).join(" ");
  }

  // 1234 -> "1.2K", the way YouTube shows its own counts. Anything that is not
  // a non-negative finite number becomes "", so a bad API answer shows nothing.
  function formatCount(n) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "";
    if (n < 1000) return String(n);
    for (const [suffix, size] of [["B", 1e9], ["M", 1e6], ["K", 1e3]]) {
      if (n >= size) {
        const value = n / size;
        return (value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value))) + suffix;
      }
    }
    return String(n);
  }

  function videoIdFrom(search) {
    return new URLSearchParams(search).get("v");
  }

  // "I BUILT A PC IN 24 HOURS" -> "I built a pc in 24 hours". Only touches a
  // title that is shouting: at least six letters, 80 % or more of them upper
  // case. Sentence case: lower-case it all, then capitalise the start of each
  // sentence and the pronoun I. Anything that is not a string comes back as is.
  function calmTitle(text) {
    if (typeof text !== "string") return text;
    const letters = text.match(/\p{L}/gu) || [];
    if (letters.length < 6) return text;
    const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
    if (upper / letters.length < 0.8) return text;
    return text
      .toLowerCase()
      .replace(/(^|[.!?]\s+)(\p{L})/gu, (match, before, letter) => before + letter.toUpperCase())
      .replace(/\bi\b/g, "I");
  }

  root.PeaceBeStill = { FEATURES, KEYS, defaults, tokensFor, formatCount, videoIdFrom, calmTitle };
})(globalThis);
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core.js test/tidy-core.test.mjs test/helpers/load-classic.mjs
git commit -m "Add the feature list, defaults, and the pure helpers"
```

---

### Task 3: Stylesheet and content script

**Files:**
- Create: `src/hide.css`, `src/content.js`, `test/hide-css.test.mjs`

**Interfaces:**
- Consumes `globalThis.PeaceBeStill.{KEYS, tokensFor, formatCount, videoIdFrom, calmTitle}` from Task 2.
- Consumes `browser.storage.sync` / `chrome.storage.sync` (promise-returning `get(keys)` in both browsers' MV3) and `fetch`.
- Produces: the root attribute `data-peacebestill` on `<html>`; every `hide.css` rule is `html[data-peacebestill~="<key>"] <selector> { display: none !important; }`; a `<span class="peacebestill-dislikes">` inside the dislike button when `dislikeCount` is on.

- [ ] **Step 1: Write the failing test** — every CSS gate is a real key, every hiding key has a gate, and the two script-only keys have none:

`test/hide-css.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic } from "./helpers/load-classic.mjs";

const css = readFileSync(new URL("../src/hide.css", import.meta.url), "utf8");
const { PeaceBeStill } = loadClassic("src/core.js");
const SCRIPT_ONLY = ["expandDescription", "titleCase", "dislikeCount"];
const gates = [...css.matchAll(/html\[data-peacebestill~="([^"]+)"\]/g)].map((m) => m[1]);

test("every gate in tidy.css is a known feature key", () => {
  for (const gate of gates) assert.ok(PeaceBeStill.KEYS.includes(gate), `unknown gate ${gate}`);
});

test("every hiding feature has a gate; script-only features have none", () => {
  for (const key of PeaceBeStill.KEYS.filter((k) => !SCRIPT_ONLY.includes(k))) assert.ok(gates.includes(key), `no rule gated on ${key}`);
  for (const key of SCRIPT_ONLY) assert.ok(!gates.includes(key), `${key} should not be in the stylesheet`);
});

test("rules only ever hide; nothing is styled beyond display:none", () => {
  const declarations = [...css.matchAll(/\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.ok(declarations.length >= 7);
  for (const d of declarations) assert.equal(d, "display: none !important;");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/hide-css.test.mjs`
Expected: FAIL with `ENOENT ... src/hide.css`.

- [ ] **Step 3: Sanity-check the element names against a live page** (no login needed; YouTube embeds the renderer names it will build the DOM from):

```bash
curl -sL -A 'Mozilla/5.0 (X11; Linux x86_64) Firefox/154.0' 'https://www.youtube.com/watch?v=jNQXAC9IVRw' \
  | grep -o -E 'videoDescription[A-Za-z]*Renderer|horizontalCardListRenderer|guideSectionRenderer|guideEntryRenderer|topbarMenuButtonRenderer|dislikeButtonViewModel' \
  | sort | uniq -c | sort -rn
```

Expected: `videoDescriptionInfocardsSectionRenderer`, `videoDescriptionTranscriptSectionRenderer`, `dislikeButtonViewModel` and friends appear (a renderer name `fooBarRenderer` becomes the element `ytd-foo-bar-renderer`; a `fooViewModel` becomes `foo-view-model`). If a name used below is absent, note it for the audit in Task 5 rather than guessing a replacement now.

- [ ] **Step 4: Write `src/hide.css`**

```css
/* Each rule is gated on a token in the root element's data-peacebestill attribute,
   which content.js keeps equal to the set of enabled feature keys. So the
   stylesheet is fully static and a toggle takes effect without a reload. */

/* Header: the Create button */
html[data-peacebestill~="create"] ytd-masthead #buttons :is(ytd-button-renderer, ytd-topbar-menu-button-renderer):has(button[aria-label="Create"]) { display: none !important; }

/* Sidebar: the "More from YouTube" section (Premium, Music, Kids, ...) */
html[data-peacebestill~="moreFromYoutube"] ytd-guide-section-renderer:has(a[href*="music.youtube.com"]) { display: none !important; }

/* Sidebar: the new-video dot beside a subscribed channel */
html[data-peacebestill~="subscriptionDots"] ytd-guide-entry-renderer #newness-dot { display: none !important; }

/* Description: the channel row at the bottom (avatar, subscriber count, links) */
html[data-peacebestill~="descriptionChannelLinks"] ytd-video-description-infocards-section-renderer { display: none !important; }

/* Description: the transcript / course / music cards and card lists */
html[data-peacebestill~="descriptionCards"] :is(ytd-video-description-transcript-section-renderer, ytd-video-description-course-section-renderer, ytd-video-description-music-section-renderer, #description ytd-horizontal-card-list-renderer) { display: none !important; }

/* Description: hashtags above the title and hashtag chips in the text */
html[data-peacebestill~="descriptionChips"] :is(ytd-watch-metadata #super-title, #description a[href^="/hashtag/"]) { display: none !important; }

/* Sidebar: the About / Press / Copyright block */
html[data-peacebestill~="footer"] ytd-guide-renderer #footer { display: none !important; }
```

- [ ] **Step 5: Write `src/content.js`**

```js
// Runs at document_start on youtube.com. Keeps the root element's data-peacebestill
// attribute equal to the enabled feature keys (tidy.css does the hiding), opens
// the description on each watch page, and shows the dislike count when asked.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { KEYS, tokensFor, formatCount, videoIdFrom, calmTitle } = globalThis.PeaceBeStill;
  let settings = {};

  // YouTube is a single-page app: the watch page appears after its own
  // navigation event, not a page load, and its parts arrive a little after
  // that. Every DOM lookup below retries briefly, acts once, and stops, so
  // nothing is left observing.
  const RETRY_MS = 250;
  const RETRY_LIMIT = 40; // ~10 s

  function whenPresent(selector, then) {
    let attempts = 0;
    const tick = () => {
      const element = document.querySelector(selector);
      if (element) return then(element);
      if (++attempts < RETRY_LIMIT) setTimeout(tick, RETRY_MS);
    };
    tick();
  }

  function apply() {
    document.documentElement.dataset.ytTidy = tokensFor(settings);
  }

  function onWatchPage() {
    return location.pathname.startsWith("/watch");
  }

  // --- Description expansion -----------------------------------------------
  function expandDescription() {
    if (settings.expandDescription === false || !onWatchPage()) return;
    whenPresent("#description-inline-expander", (expander) => {
      if (!expander.hasAttribute("is-expanded")) expander.querySelector("#expand")?.click();
    });
  }

  // --- Dislike count -------------------------------------------------------
  // YouTube stopped publishing dislikes in 2021. Return YouTube Dislike keeps
  // an estimate per video and serves it with open CORS, so a content-script
  // fetch needs no extra permission. Off by default (see tidy-core.js).
  const RYD = "https://returnyoutubedislikeapi.com/votes?videoId=";
  let currentVideo = null;

  function removeDislikes() {
    currentVideo = null;
    document.querySelector(".peacebestill-dislikes")?.remove();
  }

  async function showDislikes() {
    const videoId = onWatchPage() ? videoIdFrom(location.search) : null;
    if (settings.dislikeCount !== true || !videoId) return;
    currentVideo = videoId;
    let dislikes;
    try {
      const response = await fetch(RYD + encodeURIComponent(videoId));
      if (!response.ok) return;
      ({ dislikes } = await response.json());
    } catch {
      return;
    }
    if (currentVideo !== videoId) return; // navigated away while waiting
    whenPresent("dislike-button-view-model button", (button) => {
      if (currentVideo !== videoId) return;
      let span = button.querySelector(".peacebestill-dislikes");
      if (!span) {
        span = document.createElement("span");
        span.className = "peacebestill-dislikes";
        span.style.marginLeft = "6px";
        button.append(span);
      }
      span.textContent = formatCount(dislikes);
    });
  }

  // --- ALL-CAPS titles -------------------------------------------------------
  // Titles render and re-render as YouTube streams results in, so this is the
  // one place an observer stays on: a debounced pass over title elements that
  // rewrites text nodes which are shouting (calmTitle leaves the rest alone).
  // Text nodes only, never elements, so YouTube's markup survives.
  const TITLE_SELECTOR = "#video-title, a#video-title-link, ytd-watch-metadata h1 yt-formatted-string";
  let titleObserver = null;
  let titleTimer = null;

  function calmTitles() {
    for (const element of document.querySelectorAll(TITLE_SELECTOR)) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const calm = calmTitle(node.nodeValue);
        if (calm !== node.nodeValue) node.nodeValue = calm;
      }
      if (element.title) {
        const calm = calmTitle(element.title);
        if (calm !== element.title) element.title = calm;
      }
    }
  }

  function watchTitles() {
    if (settings.titleCase === false) {
      titleObserver?.disconnect();
      titleObserver = null;
      return;
    }
    calmTitles();
    if (titleObserver) return;
    titleObserver = new MutationObserver(() => {
      clearTimeout(titleTimer);
      titleTimer = setTimeout(calmTitles, 200);
    });
    titleObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  // --- Wiring ----------------------------------------------------------------
  function refresh() {
    apply();
    expandDescription();
    removeDislikes();
    showDislikes();
    watchTitles();
  }

  api.storage.sync.get(KEYS).then((stored) => {
    settings = stored;
    refresh();
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
    refresh();
  });

  document.addEventListener("yt-navigate-finish", refresh);
})();
```

- [ ] **Step 6: Run tests and lint**

Run: `npm test && npm run lint`
Expected: all PASS; lint 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/hide.css src/content.js test/hide-css.test.mjs
git commit -m "Add the gated stylesheet and the content script that drives it"
```

---

### Task 4: Options page

**Files:**
- Create: `src/options.html`, `src/options.js`, `src/options.css`, `test/options.test.mjs`

**Interfaces:**
- Consumes `globalThis.PeaceBeStill.{FEATURES, KEYS, defaults}` from Task 2.
- Produces: one `<input type="checkbox" name="<key>">` per feature inside `<form id="features">`; each change writes `{ [key]: boolean }` to `storage.sync`. Ticking `dislikeCount` first calls `permissions.request({ data_collection: ["browsingActivity"] })` when that API exists (Firefox); a refusal unticks the box and writes nothing.

- [ ] **Step 1: Write the failing test** — the page loads the core first, and the script builds one checkbox per key from `FEATURES`, reflecting stored settings over defaults (tested with a minimal fake DOM and fake storage):

`test/options.test.mjs`:

```js
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
  const { PeaceBeStill } = loadClassic("src/core.js");
  const { document, form } = fakeDocument();
  const writes = [];
  const chrome = { storage: { sync: { get: async () => ({ create: false }), set: async (obj) => writes.push(obj) } } };
  loadClassic("src/options.js", { PeaceBeStill, document, chrome });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(form.elements.map((e) => e.name), [...PeaceBeStill.KEYS]);
  const box = (name) => form.elements.find((e) => e.name === name);
  assert.equal(box("create").checked, false, "stored value wins");
  assert.equal(box("footer").checked, true, "default on");
  assert.equal(box("dislikeCount").checked, false, "default off");

  await form.listeners.change({ target: { name: "footer", checked: false } });
  assert.deepEqual(plain(writes), [{ footer: false }]);
});

test("ticking the dislike count asks Firefox for the optional data-collection permission first", async () => {
  const { PeaceBeStill } = loadClassic("src/core.js");
  const { document, form } = fakeDocument();
  const writes = [];
  const requests = [];
  let answer = true;
  const browser = {
    storage: { sync: { get: async () => ({}), set: async (obj) => writes.push(obj) } },
    permissions: { request: async (req) => { requests.push(req); return answer; } },
  };
  loadClassic("src/options.js", { PeaceBeStill, document, browser });
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/options.test.mjs`
Expected: FAIL with `ENOENT ... src/options.html`.

- [ ] **Step 3: Write the options page**

`src/options.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PeaceBeStill - YouTube</title>
    <link rel="stylesheet" href="options.css" />
  </head>
  <body>
    <form id="features"></form>
    <script src="tidy-core.js"></script>
    <script src="options.js"></script>
  </body>
</html>
```

`src/options.js`:

```js
// One checkbox per feature, read from and written to storage.sync. The content
// script listens for those writes, so a change shows up in open tabs at once.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { FEATURES, KEYS, defaults } = globalThis.PeaceBeStill;
  const form = document.getElementById("features");

  for (const [key, label] of FEATURES) {
    const row = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = key;
    row.append(box, document.createTextNode(" " + label));
    form.append(row);
  }

  api.storage.sync.get(KEYS).then((stored) => {
    const settings = { ...defaults(), ...stored };
    for (const box of form.elements) box.checked = settings[box.name] === true;
  });

  // The dislike count sends the video ID to a third party, which Firefox tracks
  // as an optional data-collection permission: ask for it on the way in, and
  // take the tick back if it is refused. Chromium has no such API; skip it.
  async function consentFor(box) {
    if (box.name !== "dislikeCount" || !box.checked) return true;
    if (!api.permissions?.request) return true;
    return api.permissions.request({ data_collection: ["browsingActivity"] });
  }

  form.addEventListener("change", async (event) => {
    const box = event.target;
    if (!(await consentFor(box))) {
      box.checked = false;
      return;
    }
    api.storage.sync.set({ [box.name]: box.checked });
  });
})();
```

`src/options.css`:

```css
body { font: 13px system-ui, sans-serif; margin: 12px; min-width: 340px; }
#features { display: grid; gap: 8px; }
label { display: flex; align-items: center; gap: 6px; }
```

- [ ] **Step 4: Run tests and lint**

Run: `npm test && npm run lint`
Expected: all PASS; lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/options.html src/options.js src/options.css test/options.test.mjs
git commit -m "Add the options page: one switch per feature"
```

---

### Task 5: Audit in both browsers (manual, with Ben)

**Files:**
- Modify: `src/hide.css`, `src/content.js` (only if the audit finds a wrong selector)
- Modify: `docs/superpowers/specs/2026-09-02-peacebestill-youtube-design.md` — update the selector table to what was verified

**Interfaces:** none; this task's deliverable is verified selectors.

- [ ] **Step 1: Load the extension unpacked in Ben's real profiles** (they are signed in, which the Subscriptions sidebar needs). Give Ben these instructions:

  - Firefox: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, pick `~/Projects/PeaceBeStill/src/manifest.json`. It stays until Firefox restarts.
  - Chromium: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick `~/Projects/PeaceBeStill/src`.
  - Alternatively for a throwaway profile: `npm run start:firefox` or `npm run start:chromium` (opens YouTube signed out; fine for everything but the Subscriptions dots).

- [ ] **Step 2: Walk the checklist, in each browser**, opening the options page from the extension's entry (Firefox: Add-ons Manager → PeaceBeStill - YouTube → Options; Chromium: Details → Extension options):

  | Check | Where | Expect |
  | --- | --- | --- |
  | Create button gone | any page, header | no Create button; the bell and avatar remain |
  | More from YouTube gone | expanded left sidebar | the section with Premium / Music / Kids is gone; Explore and Subscriptions remain |
  | Subscription dots gone | expanded left sidebar → Subscriptions | no blue dots beside channels with new uploads |
  | Footer gone | expanded left sidebar, bottom | About / Press / Copyright … © Google block gone |
  | Description opens | a watch page, then click another video | description is expanded on arrival both times; nothing flickers |
  | Channel row gone | expanded description, bottom | the avatar + subscriber count + link chips row is gone |
  | Cards gone | expanded description | transcript / podcast / chapters / music cards gone; the text remains |
  | Chips gone | title area and description text | hashtags above the title and #hashtag chips in the text gone |
  | Shouty titles calmed | home grid, watch page heading, watch sidebar; scroll to load more | an ALL-CAPS title reads in sentence case everywhere, including titles that arrive by scrolling; normal titles untouched; unticking stops further rewriting |
  | Dislike count (tick it on first) | a watch page, then another video | a compact number appears beside the thumbs-down within ~2 s; it changes on the next video; unticking removes it |
  | Toggles are live | options page | unticking a box restores the element in the open tab without a reload; ticking hides it again |
  | Console clean | devtools console on a watch page | no errors from content.js |

- [ ] **Step 3: For every failed row, find the real element** — Ben right-clicks the still-visible element → Inspect, and pastes the element's tag, `id`, and the nearest `ytd-*` ancestor. Replace the selector in `src/hide.css` (or `#description-inline-expander` / `#expand` / `is-expanded` / `dislike-button-view-model button` in `src/content.js`), reload the temporary add-on, re-check that row. Keep rules `display: none !important` only, so `test/hide-css.test.mjs` keeps passing.

- [ ] **Step 4: Record what was verified** — update the selector column in the spec's Features table to the working selectors, and note the date and browser versions under the table.

- [ ] **Step 5: Run tests and lint, commit**

Run: `npm test && npm run lint`

```bash
git add src/hide.css src/content.js docs/superpowers/specs/2026-09-02-peacebestill-youtube-design.md
git commit -m "Audit selectors against live YouTube in Firefox and Chromium"
```

---

### Task 6: CRX packer (`scripts/pack-crx.mjs`)

**Files:**
- Create: `scripts/pack-crx.mjs`, `test/pack-crx.test.mjs`

**Interfaces:**
- Produces (ES module exports): `publicKeyDer(pem: string): Buffer` (SPKI DER); `crxId(pubDer: Buffer): string` (32 chars `a`–`p`); `packCrx(zip: Buffer, pem: string): Buffer` (CRX3 bytes).
- Produces CLI: `node scripts/pack-crx.mjs --key <pem> --zip <zip> --out <crx>` and `node scripts/pack-crx.mjs --key <pem> --id` (prints the ID). Used by Task 8's workflow and Task 10 (the ID for the Chromium policy).

Background, so the code below makes sense: a CRX3 file is `"Cr24"`, uint32 LE `3`, uint32 LE header length, a protobuf `CrxFileHeader`, then the zip. `CrxFileHeader` field 2 is a repeated `AsymmetricKeyProof { 1: public_key (DER SPKI), 2: signature }`; field 10000 is `signed_header_data`, the bytes of `SignedData { 1: crx_id (16 bytes) }`. The signature is RSA PKCS#1 v1.5 / SHA-256 over `"CRX3 SignedData\0"` + uint32 LE length of `signed_header_data` + `signed_header_data` + the zip. `crx_id` is the first 16 bytes of SHA-256 of the public key DER, and the human ID is those 16 bytes in hex with each hex digit mapped to `a`–`p`.

- [ ] **Step 1: Write the failing test** (includes a tiny protobuf reader, so the test checks the real structure):

`test/pack-crx.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { packCrx, crxId, publicKeyDer } from "../scripts/pack-crx.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" });

// Minimal protobuf reader: yields [fieldNumber, bytes] for length-delimited fields.
function* fields(buf) {
  let i = 0;
  const varint = () => { let r = 0, s = 0; for (;;) { const b = buf[i++]; r += (b & 0x7f) * 2 ** s; s += 7; if (b < 0x80) return r; } };
  while (i < buf.length) {
    const tag = varint();
    const num = Math.floor(tag / 8), wire = tag % 8;
    if (wire !== 2) throw new Error(`unexpected wire type ${wire}`);
    const len = varint();
    yield [num, buf.subarray(i, i + len)];
    i += len;
  }
}

test("the ID is 32 letters a-p derived from the public key", () => {
  const id = crxId(publicKeyDer(pem));
  assert.match(id, /^[a-p]{32}$/);
  assert.equal(crxId(publicKeyDer(pem)), id, "stable for the same key");
});

test("packCrx writes a CRX3 whose signature verifies and whose payload is the zip", () => {
  const zip = Buffer.from("PK not really a zip but the packer does not care");
  const crx = packCrx(zip, pem);

  assert.equal(crx.subarray(0, 4).toString("latin1"), "Cr24");
  assert.equal(crx.readUInt32LE(4), 3);
  const headerLength = crx.readUInt32LE(8);
  const header = crx.subarray(12, 12 + headerLength);
  assert.deepEqual(crx.subarray(12 + headerLength), zip);

  const parsed = Object.fromEntries([...fields(header)]);   // { 2: proof, 10000: signedHeaderData }
  const proof = Object.fromEntries([...fields(parsed[2])]);  // { 1: publicKey, 2: signature }
  const signedHeaderData = parsed[10000];
  const idBytes = Object.fromEntries([...fields(signedHeaderData)])[1];
  assert.equal(idBytes.length, 16);
  assert.deepEqual(proof[1], publicKeyDer(pem));

  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32LE(signedHeaderData.length);
  const signed = Buffer.concat([Buffer.from("CRX3 SignedData\0"), lengthPrefix, signedHeaderData, zip]);
  const pub = createPublicKey({ key: proof[1], format: "der", type: "spki" });
  assert.equal(verify("sha256", signed, pub, proof[2]), true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/pack-crx.test.mjs`
Expected: FAIL with `Cannot find module ... scripts/pack-crx.mjs`.

- [ ] **Step 3: Write `scripts/pack-crx.mjs`**

```js
#!/usr/bin/env node
// Packs a zip into a CRX3 with an RSA private key, using only node:crypto.
//
//   node scripts/pack-crx.mjs --key key.pem --zip dist/peacebestill-youtube.zip --out dist/peacebestill-youtube.crx
//   node scripts/pack-crx.mjs --key key.pem --id        # print the extension ID and exit
//
// Format: "Cr24", uint32 LE 3, uint32 LE header length, CrxFileHeader, zip.
// CrxFileHeader { 2: AsymmetricKeyProof { 1: public_key, 2: signature }, 10000: SignedData { 1: crx_id } }
// Signature: RSA PKCS#1 v1.5 SHA-256 over "CRX3 SignedData\0" + uint32 LE len(SignedData) + SignedData + zip.
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function varint(n) {
  const out = [];
  while (n >= 0x80) { out.push((n % 128) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return Buffer.from(out);
}

function lengthDelimited(fieldNumber, bytes) {
  return Buffer.concat([varint(fieldNumber * 8 + 2), varint(bytes.length), bytes]);
}

export function publicKeyDer(pem) {
  return createPublicKey(createPrivateKey(pem)).export({ type: "spki", format: "der" });
}

function idBytes(pubDer) {
  return createHash("sha256").update(pubDer).digest().subarray(0, 16);
}

export function crxId(pubDer) {
  return [...idBytes(pubDer).toString("hex")]
    .map((hexDigit) => String.fromCharCode(97 + parseInt(hexDigit, 16)))
    .join("");
}

export function packCrx(zip, pem) {
  const pubDer = publicKeyDer(pem);
  const signedHeaderData = lengthDelimited(1, idBytes(pubDer));
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32LE(signedHeaderData.length);
  const toSign = Buffer.concat([Buffer.from("CRX3 SignedData\0"), lengthPrefix, signedHeaderData, zip]);
  const signature = sign("sha256", toSign, createPrivateKey(pem));
  const proof = Buffer.concat([lengthDelimited(1, pubDer), lengthDelimited(2, signature)]);
  const header = Buffer.concat([lengthDelimited(2, proof), lengthDelimited(10000, signedHeaderData)]);
  const prefix = Buffer.alloc(12);
  prefix.write("Cr24", 0, "latin1");
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  return Buffer.concat([prefix, header, zip]);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keyPath = arg("--key");
  if (!keyPath) {
    console.error("usage: pack-crx.mjs --key key.pem (--id | --zip in.zip --out out.crx)");
    process.exit(2);
  }
  const pem = readFileSync(keyPath, "utf8");
  if (process.argv.includes("--id")) {
    console.log(crxId(publicKeyDer(pem)));
  } else {
    const zipPath = arg("--zip");
    const outPath = arg("--out");
    if (!zipPath || !outPath) {
      console.error("usage: pack-crx.mjs --key key.pem --zip in.zip --out out.crx");
      process.exit(2);
    }
    writeFileSync(outPath, packCrx(readFileSync(zipPath), pem));
    console.log(`${outPath} (id ${crxId(publicKeyDer(pem))})`);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Prove it against a real browser** — build the zip, pack it with a throwaway key, and check Chromium accepts the file. Chromium refuses a CRX whose header is malformed or whose signature does not match, so a successful load is the real test:

```bash
npm run build
openssl genrsa -out /tmp/throwaway.pem 2048 2>/dev/null
node scripts/pack-crx.mjs --key /tmp/throwaway.pem --zip dist/peacebestill-youtube.zip --out dist/throwaway.crx
node scripts/pack-crx.mjs --key /tmp/throwaway.pem --id
```

Then Ben drags `dist/throwaway.crx` onto `chrome://extensions` (developer mode on). Expected: Chromium offers to add "PeaceBeStill - YouTube"; its ID in the list equals the one printed. Remove it afterwards; delete `/tmp/throwaway.pem`.

- [ ] **Step 6: Commit**

```bash
git add scripts/pack-crx.mjs test/pack-crx.test.mjs
git commit -m "Add a CRX3 packer that needs nothing beyond node:crypto"
```

---

### Task 7: Update manifests and the tag/version check

**Files:**
- Create: `scripts/update-manifests.mjs`, `scripts/check-version.mjs`, `test/update-manifests.test.mjs`, `test/check-version.test.mjs`

**Interfaces:**
- Produces (exports): `firefoxUpdates({ id, version, xpiUrl }): string` (JSON text) and `chromiumUpdates({ id, version, crxUrl }): string` (XML text).
- Produces CLI: `node scripts/update-manifests.mjs --repo <owner/name> --tag <vX.Y.Z> --key <pem> --out <dir>` writes `<dir>/updates.json` and `<dir>/updates.xml`; the Firefox ID comes from `src/manifest.json`, the Chromium ID from the key via Task 6's `crxId`.
- Produces CLI: `node scripts/check-version.mjs <tag>` exits 0 when `<tag>` equals `v` + manifest version, else prints the mismatch and exits 1.

- [ ] **Step 1: Write the failing tests**

`test/update-manifests.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { firefoxUpdates, chromiumUpdates } from "../scripts/update-manifests.mjs";

test("Firefox update manifest has the addon, version and versioned link", () => {
  const text = firefoxUpdates({ id: "youtube@peacebestill.fyi", version: "1.2.3", xpiUrl: "https://example.test/releases/download/v1.2.3/peacebestill-youtube.xpi" });
  assert.deepEqual(JSON.parse(text), {
    addons: { "youtube@peacebestill.fyi": { updates: [{ version: "1.2.3", update_link: "https://example.test/releases/download/v1.2.3/peacebestill-youtube.xpi" }] } },
  });
  assert.ok(text.endsWith("\n"));
});

test("Chromium update manifest is a gupdate document with the app, codebase and version", () => {
  const xml = chromiumUpdates({ id: "a".repeat(32), version: "1.2.3", crxUrl: "https://example.test/releases/download/v1.2.3/peacebestill-youtube.crx?a=1&b=2" });
  assert.match(xml, /^<\?xml version='1\.0' encoding='UTF-8'\?>\n<gupdate xmlns='http:\/\/www\.google\.com\/update2\/response' protocol='2\.0'>/);
  assert.match(xml, new RegExp(`<app appid='${"a".repeat(32)}'>`));
  assert.match(xml, /codebase='https:\/\/example\.test\/releases\/download\/v1\.2\.3\/peacebestill-youtube\.crx\?a=1&amp;b=2'/);
  assert.match(xml, /version='1\.2\.3'/);
});
```

`test/check-version.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const version = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8")).version;
const script = fileURLToPath(new URL("../scripts/check-version.mjs", import.meta.url));
const run = (tag) => spawnSync(process.execPath, [script, tag], { encoding: "utf8" });

test("accepts the tag that matches the manifest", () => {
  assert.equal(run(`v${version}`).status, 0);
});

test("rejects any other tag, naming both", () => {
  const result = run("v0.0.1");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /v0\.0\.1/);
  assert.match(result.stderr, new RegExp(version.replace(/\./g, "\\.")));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/update-manifests.test.mjs test/check-version.test.mjs`
Expected: both FAIL with `Cannot find module`.

- [ ] **Step 3: Write `scripts/update-manifests.mjs`**

```js
#!/usr/bin/env node
// Writes the two update manifests the browsers poll, for one release:
//   node scripts/update-manifests.mjs --repo nascosto/PeaceBeStill --tag v1.0.0 --key key.pem --out dist
// Firefox reads updates.json (its ID comes from src/manifest.json); Chromium
// reads updates.xml (its ID is derived from the CRX signing key). Both point at
// that release's own versioned asset URLs, while the browsers fetch the
// manifests themselves from the constant "latest" URLs in the manifest.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { crxId, publicKeyDer } from "./pack-crx.mjs";

export function firefoxUpdates({ id, version, xpiUrl }) {
  return JSON.stringify({ addons: { [id]: { updates: [{ version, update_link: xpiUrl }] } } }, null, 2) + "\n";
}

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/</g, "&lt;");

export function chromiumUpdates({ id, version, crxUrl }) {
  return [
    "<?xml version='1.0' encoding='UTF-8'?>",
    "<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>",
    `  <app appid='${id}'>`,
    `    <updatecheck codebase='${escapeXml(crxUrl)}' version='${version}' />`,
    "  </app>",
    "</gupdate>",
    "",
  ].join("\n");
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = arg("--repo");
  const tag = arg("--tag");
  const keyPath = arg("--key");
  const out = arg("--out");
  if (!repo || !tag || !keyPath || !out) {
    console.error("usage: update-manifests.mjs --repo owner/name --tag vX.Y.Z --key key.pem --out dir");
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));
  const base = `https://github.com/${repo}/releases/download/${tag}/`;
  writeFileSync(`${out}/updates.json`, firefoxUpdates({
    id: manifest.browser_specific_settings.gecko.id,
    version: manifest.version,
    xpiUrl: base + "peacebestill-youtube.xpi",
  }));
  writeFileSync(`${out}/updates.xml`, chromiumUpdates({
    id: crxId(publicKeyDer(readFileSync(keyPath, "utf8"))),
    version: manifest.version,
    crxUrl: base + "peacebestill-youtube.crx",
  }));
  console.log(`${out}/updates.json and ${out}/updates.xml for ${tag}`);
}
```

- [ ] **Step 4: Write `scripts/check-version.mjs`**

```js
#!/usr/bin/env node
// Release guard: the git tag must be "v" + the manifest version, so a release
// can never carry a package whose own version says something else.
//   node scripts/check-version.mjs v1.0.0
import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? "";
const { version } = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));
if (tag !== `v${version}`) {
  console.error(`tag ${tag || "(none)"} does not match src/manifest.json version ${version} (expected v${version})`);
  process.exit(1);
}
console.log(`tag ${tag} matches manifest version ${version}`);
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/update-manifests.mjs scripts/check-version.mjs test/update-manifests.test.mjs test/check-version.test.mjs
git commit -m "Add the update-manifest writer and the tag/version guard"
```

---

### Task 8: CI, release workflow, README, and the signing key

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `README.md`
- Create (outside the repo): `~/.config/peacebestill/youtube-crx-key.pem`
- Modify: `docs/superpowers/specs/2026-09-02-peacebestill-youtube-design.md` (record the Chromium ID)

**Interfaces:**
- Consumes the npm scripts from Task 1 and the three scripts from Tasks 6–7.
- Produces: on tag `vX.Y.Z`, a GitHub release carrying `peacebestill-youtube.xpi`, `peacebestill-youtube.crx`, `updates.json`, `updates.xml`.
- Produces: the Chromium extension ID (printed in Step 4), used by Task 10.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - run: npm ci
      - run: npm test
      - run: npm run lint
```

- [ ] **Step 2: Write `.github/workflows/release.yml`**

```yaml
name: release

# A v* tag becomes a GitHub release with four constant-named assets: the
# Mozilla-signed XPI, the CRX packed with the repo's fixed key, and the two
# update manifests the browsers poll. system-setups points at
# .../releases/latest/download/<asset> for all four.
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: node scripts/check-version.mjs "$GITHUB_REF_NAME"

      - name: Sign for Firefox (Mozilla self-distribution channel)
        env:
          WEB_EXT_API_KEY: ${{ secrets.AMO_JWT_ISSUER }}
          WEB_EXT_API_SECRET: ${{ secrets.AMO_JWT_SECRET }}
        run: |
          npx web-ext sign --source-dir src --artifacts-dir dist --channel unlisted
          mv dist/*.xpi dist/peacebestill-youtube.xpi

      - name: Pack for Chromium and write the update manifests
        env:
          YOUTUBE_CRX_PRIVATE_KEY: ${{ secrets.YOUTUBE_CRX_PRIVATE_KEY }}
        run: |
          printf '%s\n' "$YOUTUBE_CRX_PRIVATE_KEY" > "$RUNNER_TEMP/key.pem"
          npm run build
          node scripts/pack-crx.mjs --key "$RUNNER_TEMP/key.pem" --zip dist/peacebestill-youtube.zip --out dist/peacebestill-youtube.crx
          node scripts/update-manifests.mjs --repo "$GITHUB_REPOSITORY" --tag "$GITHUB_REF_NAME" --key "$RUNNER_TEMP/key.pem" --out dist
          rm -f "$RUNNER_TEMP/key.pem"

      - name: Create the release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "$GITHUB_REF_NAME" \
            dist/peacebestill-youtube.xpi dist/peacebestill-youtube.crx dist/updates.json dist/updates.xml \
            --title "$GITHUB_REF_NAME" \
            --notes "PeaceBeStill - YouTube $GITHUB_REF_NAME. Installed through system-setups; the assets below are what its browser policies fetch."
```

- [ ] **Step 3: Write `README.md`**

````markdown
# PeaceBeStill - YouTube

A tiny Firefox and Chromium extension that hides the bits of desktop YouTube
you never use, opens the video description for you, and can show the dislike
count. Every feature is a switch on the options page:

- the Create button in the header
- the "More from YouTube" sidebar section
- the new-video dot beside channels in the Subscriptions list
- the description: opened automatically, and its channel row, its
  transcript / podcast / chapters / music cards, and its hashtags and link
  chips, each separately
- the About / Press / Copyright block under the sidebar
- ALL-CAPS video titles, rewritten in sentence case wherever they appear
- the dislike count beside the thumbs-down, **off by default**: it comes from
  the Return YouTube Dislike service, so turning it on tells that service
  which video you are watching. With it off the extension makes no network
  requests at all. Firefox treats that as an optional data-collection
  permission and asks you once when you tick the box.

Manifest V3, one codebase for both browsers, no background script, only the
`storage` permission, only on `www.youtube.com`.

## How it works

`src/content.js` keeps a `data-peacebestill` attribute on `<html>` equal to the
enabled feature keys; `src/hide.css` has one `display: none` rule per feature
gated on that attribute, so toggles apply to open tabs instantly. The same
script clicks the description's expand control once per watch-page navigation
and, when asked, fetches the dislike count and writes it into the dislike
button. `src/core.js` holds the feature list both the content script and
the options page use.

## Developing

    npm install
    npm test                 # node --test
    npm run lint             # web-ext lint (self-hosted rules)
    npm run start:firefox    # throwaway Firefox profile with the extension loaded
    npm run start:chromium

To try it in your real, signed-in profile: Firefox → `about:debugging` → This
Firefox → Load Temporary Add-on → `src/manifest.json`; Chromium →
`chrome://extensions` → Developer mode → Load unpacked → `src/`.

YouTube's markup is undocumented and changes. When a switch stops working,
inspect the element, fix the selector in `src/hide.css`, and re-check.

## Releasing

Releases are built by `.github/workflows/release.yml` from a version tag. The
tag must equal `v` + the version in `src/manifest.json`.

    # bump "version" in src/manifest.json and package.json, commit, then:
    git tag v1.0.1 && git push origin main v1.0.1

The workflow signs the XPI through Mozilla's self-distribution channel, packs
the CRX with the repo's fixed key, writes the two update manifests, and
attaches all four to the release under constant names, so these URLs are
always the newest version:

    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.xpi
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.crx
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.json
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.xml

### Secrets (set once: repository settings → Secrets and variables → Actions)

| Secret | Where it comes from |
| --- | --- |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | https://addons.mozilla.org/developers/addon/api/key/ (a free Mozilla account) |
| `YOUTUBE_CRX_PRIVATE_KEY` | the PEM generated below; the Chromium extension ID is derived from it, so it must never change |

    mkdir -p ~/.config/peacebestill
    openssl genrsa -out ~/.config/peacebestill/youtube-crx-key.pem 2048
    node scripts/pack-crx.mjs --key ~/.config/peacebestill/youtube-crx-key.pem --id   # the Chromium ID

Keep the PEM out of the repo (`.gitignore` already excludes `*.pem`).

## Installing on your machines

[system-setups](https://github.com/nascosto/system-setups) installs it through
Firefox's and Chromium's enterprise policies: Firefox everywhere and Chromium on
Linux fetch it from the URLs above and keep it updated. Chromium on Windows only
allows it, because Chromium there refuses to force-install anything from
outside the Web Store on an unmanaged machine: drop `peacebestill-youtube.crx` onto
`chrome://extensions` once and it updates itself afterwards.
````

- [ ] **Step 4: Generate the CRX key and print the ID** (this is the one that goes into the secret and into system-setups):

```bash
mkdir -p ~/.config/peacebestill
openssl genrsa -out ~/.config/peacebestill/youtube-crx-key.pem 2048
node scripts/pack-crx.mjs --key ~/.config/peacebestill/youtube-crx-key.pem --id
```

Expected: a 32-letter ID. Record it in the spec under "Integration with system-setups" as `Chromium ID: <id>`.

- [ ] **Step 5: Validate the workflows parse, run the suite, commit**

```bash
python3 -c "import yaml; [yaml.safe_load(open(f)) for f in ('.github/workflows/ci.yml', '.github/workflows/release.yml')]" && echo "workflows parse"
npm test && npm run lint
git add .github/workflows/ci.yml .github/workflows/release.yml README.md docs/superpowers/specs/2026-09-02-peacebestill-youtube-design.md
git commit -m "Add CI, the tag-driven release workflow, and the README"
```

---

### Task 9: Publish: repo, secrets, first release (Ben's hands, Claude verifies)

**Files:** none in this repo.

**Interfaces:**
- Produces: the four asset URLs live at `https://github.com/nascosto/PeaceBeStill/releases/latest/download/<asset>`, consumed by Task 10.

- [ ] **Step 1: Ben creates the public repo and pushes** (gh is not logged in on this machine, so this is his terminal):

```bash
cd ~/Projects/PeaceBeStill
gh auth login            # once, if not already
gh repo create nascosto/PeaceBeStill --public --source=. --remote=origin --push
```

- [ ] **Step 2: Ben adds the three secrets** — from the README's table:

```bash
gh secret set AMO_JWT_ISSUER        # paste the JWT issuer from addons.mozilla.org
gh secret set AMO_JWT_SECRET        # paste the JWT secret
gh secret set YOUTUBE_CRX_PRIVATE_KEY < ~/.config/peacebestill/youtube-crx-key.pem
```

- [ ] **Step 3: Confirm CI is green on main**

Run: `gh run list --limit 1` (Ben). Expected: `ci` completed, success.

- [ ] **Step 4: Tag the first release**

```bash
git tag v1.0.0 && git push origin v1.0.0
gh run watch            # the release workflow; signing usually takes a few minutes
```

- [ ] **Step 5: Verify the release from this machine** (no auth needed, the repo is public):

```bash
for a in peacebestill-youtube.xpi peacebestill-youtube.crx updates.json updates.xml; do
  printf '%-18s ' "$a"; curl -sIL -o /dev/null -w '%{http_code} %{url_effective}\n' "https://github.com/nascosto/PeaceBeStill/releases/latest/download/$a"
done
curl -sL https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.json | python3 -m json.tool
curl -sL https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.xml
curl -sL -o /tmp/yt.xpi https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.xpi && unzip -l /tmp/yt.xpi | grep -E 'META-INF/(mozilla\.rsa|cose\.sig)'
```

Expected: four `200`s; `updates.json` names `youtube@peacebestill.fyi` and version `1.0.0` with a `releases/download/v1.0.0/` link; `updates.xml` names the ID from Task 8 Step 4; the XPI contains Mozilla's signature files.

---

### Task 10: Install it through system-setups

**Files (in `~/Projects/system-setups`, on a new branch `peacebestill-youtube-policy` off `main`):**
- Modify: `lib/common.sh` — the Firefox heredoc in `step_firefox_policies` and the Chromium heredoc in `step_chromium_policies`
- Modify: `windows-setup.dsc.yaml` — the `firefox-extensions` MultiString and the `chromium-extensions` String
- Modify: `README.md` — the browser-extension note
- Test: `lib/browser-policy.test.py` (existing; must stay green)

**Interfaces:**
- Consumes the Chromium ID from Task 8 Step 4 (written `<CRX_ID>` below; substitute the real value) and the four URLs from Task 9.

- [ ] **Step 1: Run the existing test to see it green before touching anything**

Run: `cd ~/Projects/system-setups && git checkout -b peacebestill-youtube-policy origin/main && python3 lib/browser-policy.test.py`
Expected: `0 failure(s)`.

- [ ] **Step 2: Add the Firefox entry** to both copies. In `lib/common.sh`, inside the `policies.json` heredoc, after the `magnolia@12.34` entry (add a comma to that entry's closing brace):

```json
      "youtube@peacebestill.fyi": {
        "installation_mode": "normal_installed",
        "install_url": "https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.xpi"
      }
```

In `windows-setup.dsc.yaml`, in the `firefox-extensions` resource's `ValueData` list, change the `'  }'` line after the `magnolia@12.34` block to `'  },'` and append before the final `'}'`:

```yaml
          - '  "youtube@peacebestill.fyi": {'
          - '    "installation_mode": "normal_installed",'
          - '    "install_url": "https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.xpi"'
          - '  }'
```

- [ ] **Step 3: Add the Chromium entry.** In `lib/common.sh`, inside the `extensions.json` heredoc, after the `lkbebcjgcmobigpeffafkodonchffocl` entry (add the comma):

```json
    "<CRX_ID>": {
      "installation_mode": "normal_installed",
      "update_url": "https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.xml"
    }
```

and add a line to the ID → name comment table above the heredoc: `#   <CRX_ID>  PeaceBeStill - YouTube`. In `windows-setup.dsc.yaml`, in the `chromium-extensions` resource's folded `ValueData`, change the last line's `"allowed"}}` to `"allowed"},` and add a final line:

```yaml
          "<CRX_ID>": {"installation_mode": "allowed"}}
```

(Windows gets `allowed` only, like Bypass Paywalls Clean: Chromium on Windows refuses off-store force-installs on an unmanaged machine, and the test permits exactly this exception.)

- [ ] **Step 3b: Drop Unhook.** PeaceBeStill - YouTube now covers every Unhook option, so remove Unhook from both browsers' lists in the same change: in `lib/common.sh` the `myallychou@gmail.com` entry of the Firefox heredoc and the `khncfooichmfjbepaaaebmommgaepoid` entry (and its comment-table line) of the Chromium heredoc; in `windows-setup.dsc.yaml` the matching `myallychou@gmail.com` block of the Firefox MultiString and the `khncfooichmfjbepaaaebmommgaepoid` line of the Chromium String. A machine that already has Unhook keeps it installed but can now remove it from about:addons.

- [ ] **Step 4: README note.** In `README.md`'s "Notes and known rough edges", extend the Chromium bullet's Windows sentence so it names both hand-installed extensions: after "Install it by hand once — download `bypass-paywalls-chrome-clean-latest.crx` from the author's GitFlic `bpc_uploads` project and drop it onto chrome://extensions — and it updates itself from then on." add "The same goes for PeaceBeStill - YouTube, our own extension (`peacebestill-youtube.crx` from its GitHub releases)."

- [ ] **Step 5: Run the suite** (the same commands CI runs):

```bash
python3 lib/browser-policy.test.py
shellcheck -x -s bash -S warning fedora-setup.sh ubuntu-setup.sh lib/common.sh   # or the scratchpad shellcheck binary
bash -n lib/common.sh
```

Expected: `0 failure(s)` with new `ok` lines for `youtube@peacebestill.fyi` on both platforms and for `<CRX_ID>` (`allowed only: off-store on Windows`); shellcheck clean.

- [ ] **Step 6: Commit and push**

```bash
git add lib/common.sh windows-setup.dsc.yaml README.md
git commit -m "Install PeaceBeStill - YouTube through the browser policies"
git push -u origin peacebestill-youtube-policy
```

Ben opens the PR (gh is not logged in here).

- [ ] **Step 7: Apply on this machine and confirm** — Ben runs, in a real terminal:

```bash
cd ~/Projects/system-setups && bash -c 'source lib/common.sh && step_firefox_policies'
cd ~/Projects/system-setups && CHROMIUM_POLICY_DIR=/etc/chromium/policies/managed bash -c 'source lib/common.sh && step_chromium_policies'
```

then restarts both browsers. Claude verifies:

```bash
grep -c 'peacebestill-youtube' /etc/firefox/policies/policies.json /etc/chromium/policies/managed/extensions.json
ls ~/.mozilla/firefox/*.default-release/extensions/ | grep peacebestill-youtube
ls ~/.config/chromium/Default/Extensions/ | grep "<CRX_ID>"
```

Expected: `1` and `1`; `youtube@peacebestill.fyi.xpi` in the Firefox profile; the `<CRX_ID>` directory in the Chromium profile. Then the Task 5 checklist once more, briefly, in both browsers, now on the policy-installed copies.
