# PeaceBeStill - LinkedIn — design

Date: 2026-09-07. Status: approved in conversation, awaiting implementation plan.

## Goal

A second extension in this repo, `PeaceBeStill - LinkedIn`, built on the same
switch-driven chassis as the YouTube one: Manifest V3, one codebase for Firefox
and Chromium, no background script, `storage` and nothing else, and **every
switch off out of the box** so a fresh install changes nothing.

The motivation is a particular kind of reluctant use — needing LinkedIn for the
network without wanting LinkedIn — but the extension itself takes no view on
that. Like the YouTube one, it is general purpose: everything it can do is a
switch, and which of them are on is the user's business.

Its centrepiece, and the first thing it ships, is a switch that turns the whole
site off.

**Firefox first.** The YouTube extension has just gone out as a Firefox add-on,
with the Chrome Web Store listing still to come. LinkedIn follows the same
order, which the release pipeline already supports: a store step whose listing
variable is unset is skipped, not failed.

## The blackout switch

`blackout` — *"Replace LinkedIn with a better idea"* — replaces every
`linkedin.com` page with regular-size text reading **"You made the right
choice."** It covers the whole site with no exceptions: it is a deliberately
blunt, faintly snarky switch, not an everyday setting. To use LinkedIn again you
turn it off.

**Nesting.** `blackout` sits alone in its own group, first on the options page,
and every other top-level switch declares it as its parent. This needs no new
logic: `isMoot` already walks the entire parent chain, so a switch nested two
deep (a child of a child of `blackout`) resolves correctly, and `options.js`
only renders a feature under its parent when both are in the same group — so a
parent living in a different group leaves every other switch rendered exactly
where it was. With `blackout` on, every other switch greys out and reads *"no
effect while 'Replace LinkedIn with a better idea' is on"*, `effective()` forces
them all off, and `data-peacebestill` reads exactly `blackout`. Stored values are
untouched, so turning it back off restores the page exactly as it was.

**Hiding.** CSS, so it applies at `document_start` without waiting on
LinkedIn's own rendering:

    html[data-peacebestill~="blackout"] body { display: none !important; }
    html[data-peacebestill~="blackout"]::before { content: "You made the right choice."; … }

The generated text is `1rem` in a system font stack, centred, with colour and
background set explicitly rather than inherited — LinkedIn ships a dark mode,
and inheriting would risk dark text on a dark ground.

**Tab title.** `blackout` also sets `document.title` to the same sentence: a tab
reading "(3) Feed | LinkedIn" behind a blank page undercuts the whole point.
LinkedIn is a single-page app and rewrites the title as it navigates, so this is
re-applied from the same MutationObserver that serves the other title work,
rather than set once.

**It costs nothing on mobile.** Hiding `body` and generating text on `html`
depends on no LinkedIn markup whatsoever, so `blackout` works identically on
Firefox for Android without a second set of rules — unlike the YouTube
extension, whose mobile site is a separate application needing its own
selectors. The same is true of the other four v1 switches, which are URL and
title logic. Every switch this extension ships at v1.0 therefore works on
Android for free.

**Not in scope for this switch.** Hiding `body` does not stop LinkedIn's
scripts, polling or telemetry — they carry on behind a blank page. A
`window.stop()` would genuinely halt the load, but it is a much blunter
instrument with more ways to misbehave, and interacts awkwardly with an
attribute that is only set after an asynchronous storage read. v1 hides; if
stopping the page outright turns out to matter, it is a later, separate switch.

**A test convention changes.** `hide-css.test.mjs` asserts that every
declaration in the stylesheet is `display: none !important`, which the generated
text breaks. The LinkedIn copy of that test exempts the `blackout` gate **by
name** and holds every other gate to the hiding-only rule. An exemption naming
one gate keeps the guard meaningful; widening the allowed-declarations list
would quietly permit anything anywhere.

Two more details of that test do not carry over and must not be copied
unthinkingly: its floor of at least 30 declarations, which a stylesheet with
two rules would fail, and its `SCRIPT_ONLY` list, which here is the three
redirects and `notificationCount` — `blackout` is the one feature that is both
a stylesheet rule and a script.

## Features

`blackout` aside, v1.0 ships only what needs no knowledge of LinkedIn's markup.
This is deliberate. LinkedIn's class names are largely hashed, its pages are
almost entirely behind a login, and — unlike the YouTube extension — there is no
live-page audit to confirm a selector (see Verification). A selector guessed and
never checked is worse than an absent switch: it looks like a working feature
and silently matches nothing.

| Key                   | Group          | Hides / does                                                                 | How |
| --------------------- | -------------- | ---------------------------------------------------------------------------- | --- |
| `blackout`            | The whole site | replaces every LinkedIn page with "You made the right choice."               | `hide.css` hides `body` and generates the text on `html`; `content.js` keeps the tab title in step |
| `homeToMessaging`     | Home and feed  | the home page opens Messaging instead of the feed                            | `content.js` `redirectFor`: `/` and `/feed/` → `/messaging/` |
| `homeToNotifications` | Home and feed  | the home page opens Notifications instead of the feed                        | same, → `/notifications/` |
| `homeToJobs`          | Home and feed  | the home page opens Jobs instead of the feed                                 | same, → `/jobs/` |
| `notificationCount`   | Notifications  | the unread count LinkedIn prepends to the tab title                          | `content.js` strips `^\(\d+\)\s+` from `document.title` (`untitled`, ported unchanged from the YouTube extension) |

The three redirect switches are independent rather than a parent with a choice
of destinations, because the switch machinery has no notion of mutual
exclusion and inventing one for three rows is not worth it. If more than one is
on, the first in table order wins; the tie-break is documented in `core.js` and
asserted in the tests, so it is defined behaviour rather than an accident of
iteration.

**Growth.** Every further switch arrives from a page pasted into a working
session: the markup is read, the switches it supports are added as rows in
`FEATURES` and rules in `hide.css`, a new group is declared if the page needs
one, and the result is checked in a real browser before it is committed. Each
page is one self-contained commit that cannot break the ones before it. Groups
are declared only as they are populated, since `options.js` renders a fieldset
per declared group and an empty one would show as an empty box.

## Architecture

`extensions/linkedin/`, the same shape as `extensions/youtube/` less the
`audit/` directory:

    extensions/linkedin/src     the extension
    extensions/linkedin/test    its unit tests

- `manifest.json` — MV3; `permissions: ["storage"]` and no `host_permissions`;
  one content script on `*://www.linkedin.com/*` at `document_start` loading
  `hide.css` and then `core.js`, `content.js`; embedded `options_ui`;
  `browser_specific_settings.gecko` with `id: linkedin@peacebestill.fyi` and
  `strict_min_version: "142.0"`, plus `gecko_android` at the same minimum;
  `minimum_chrome_version: "120"`. **No `update_url`, at either level** — the
  source tree is the package both stores receive, and both reject one that
  names its own update service; `scripts/variant.mjs` adds the two keys back
  for the self-hosted build. `data_collection_permissions` is
  `required: ["none"]` with **no** optional entry: this extension makes no
  network requests of any kind.
- `core.js` — a new file following the YouTube one's structure, not a copy of
  it. Same published surface (`GROUPS`, `FEATURES`, `KEYS`, `defaults`,
  `withDefaults`, `effective`, `isDefaultValue`, `redundantKeys`, `parentOf`,
  `isMoot`, `tokensFor`, `redirectFor`, `untitled`) minus the YouTube-specific
  helpers — `formatCount`, `videoIdFrom`, `calmTitle`, `channelHomeFor`,
  `placeholderVerdict` — which have no LinkedIn counterpart.
- `hide.css` — one rule per feature, gated on a token in `data-peacebestill` on
  the root element, so the stylesheet is fully static and a toggle reaches open
  tabs without a reload. Rules only hide, except `blackout` as described above.
  No second mobile block: see the Android note under the blackout switch.
- **The marking pass (added 2026-09-09).** What separates a promoted post from
  an ordinary one is the word "Promoted" in its header, and CSS has no text
  selector. So `content.js` reads each feed item's short labels, classifies it
  with `kindsFor`, and sets `data-pbs="sponsored"`; the stylesheet hides the
  mark. Panels in the side columns are found the same way, and the box to hide
  is the label's enclosing `<section>` where there is one, or otherwise the
  largest box around it that does not also contain a different panel's label.
  This is a real departure from the YouTube extension, where the stylesheet
  does all the work, and it is forced: nothing else about these posts is
  durable. It also makes the extension language-dependent -- the labels are
  matched in English.
- `content.js` — reads `storage.sync`, writes the enabled keys to
  `document.documentElement.dataset.peacebestill`, re-applies on
  `storage.onChanged`, performs any redirect, and runs one debounced
  MutationObserver for the tab-title work (`blackout` and `notificationCount`),
  started only when a switch that needs it is on. No dislike-count fetch, no
  consent flow, no placeholder pruning.
- `options.html` / `options.js` / `options.css` — one checkbox per key, grouped
  and nested exactly as the YouTube page does, with the same filter box, on-count,
  "turn all off" button and storage-failure status line. `options.js` drops the
  `consentFor` / `permissions.request` block entirely, since nothing here needs
  an optional data-collection permission.
- `icons/` — its own SVG-derived PNG set at 16/32/48/96/128.

**Host matching.** `www.linkedin.com` serves the mobile web too, so one match
pattern is expected to cover desktop and Android. If a paste later shows an
`m.` or `touch.` host in play, adding it is a one-line change — but it is not
being guessed at now, on the same principle as the selectors.

**Known limitation, shared with the YouTube extension.** The attribute is set
after an asynchronous storage read, so a fast connection can render a frame of
LinkedIn before it applies. Accepted for consistency rather than solved with a
mechanism this one extension would not share.

## Verification

**Revised 2026-09-09, after building it.** This section originally said that
because LinkedIn is behind a login, the live-page audit that keeps the YouTube
extension honest "cannot exist here, and there is no substitute for it". That
was wrong, and the error mattered: it argued for shipping fewer switches than
the site deserved.

An audit does exist. It just cannot run signed out, and so cannot run in CI.
`npm run dev:linkedin` opens a Firefox profile that is signed into by hand once
and kept; `npm run check:linkedin` drives that browser over Firefox's Remote
Debugging Protocol -- the channel devtools uses, which sets no
`navigator.webdriver` flag -- and reports, per switch, how many targets it
found on the current page and how many actually stopped rendering. It can
navigate between pages itself. It uses the extension's own `core.js` and lifts
the marking pass out of its `content.js`, so what it exercises is what ships.

What has not changed is the rule about markup: pages read this way are **never
committed, in any form, scrubbed or synthetic**. A signed-in LinkedIn page
carries real names, real posts and profile identifiers, and this repository is
public. `.gitignore` already excludes `**/audit/out/`.

Three things only a real page could show, all of which a unit test had happily
passed:

- The blackout sentence rendered at 10px. LinkedIn sets `html { font-size:
  62.5% }`, so a size in `rem` is not the size you asked for. Sizes there are
  absolute now.
- LinkedIn's class names are hashed and rotate per deploy, and the documented
  stable hooks are gone -- `.feed-shared-update-v2` matches nothing at all.
  What survives is ARIA (`role="listitem"`, `aside[aria-label="Aside"]`),
  `data-testid`, and the visible label.
- With two levels of nesting the options page named the wrong switch as the one
  that had locked a row: the direct parent, which may itself be off. `blockerOf`
  names the nearest ancestor actually on.

When LinkedIn changes its markup a switch stops working silently. The fix is to
open the page in the dev profile, look again, and correct the rule.

## Distribution

Every extension in this repo shares the repo's version and one tag releases them
all, so adding a second extension grows the existing pipeline rather than
forking it. Each extension goes out down four channels built from two packages,
exactly as the YouTube one does:

| Channel | Package | Add-on ID | Updates come from |
| --- | --- | --- | --- |
| addons.mozilla.org | the source tree | `linkedin@peacebestill.fyi` | Mozilla |
| Chrome Web Store | the source tree | assigned by Google | Google |
| Self-hosted Firefox | + `update_url`s, own ID | `linkedin-selfhosted@peacebestill.fyi` | the release's `.json` |
| Self-hosted Chromium | + `update_url`s | derived from the CRX key | the release's `.xml` |

The self-hosted Firefox ID is produced by `variant.mjs`'s `selfHostedId`, so it
follows from the manifest ID and needs no separate decision.

- `package.json` — adds `lint:linkedin`, `build:linkedin:store` and
  `build:linkedin:selfhosted` alongside a `build:linkedin` that runs both, with
  `lint` and `build` covering both extensions. The unprefixed `start:firefox`
  and `start:chromium` become `:youtube` and `:linkedin` variants, which breaks
  the documented developer commands, so the README changes with them. No
  `audit:*` scripts.
- `release.yml` and `publish-stores.yml` — `extensions/linkedin/src` added to
  the `check-version.mjs` arguments, a sign step, a CRX pack step, and the two
  store steps, each gated on its own repository variable (`LINKEDIN_AMO_SLUG`,
  `LINKEDIN_CWS_ITEM_ID`) the way the YouTube ones are. Four more assets on the
  release: `peacebestill-linkedin.{xpi,crx}` and
  `peacebestill-linkedin-updates.{json,xml}`.
- One new secret, `LINKEDIN_CRX_PRIVATE_KEY`, from a PEM generated locally the
  way the README documents. Each extension needs its own key, since the
  self-hosted Chromium ID derives from it and two extensions cannot share an ID.
  **Generate it as part of building the chassis, even though Chrome comes
  later.** It is one `openssl` command, it never expires, and it keeps the
  release job a straight copy of the YouTube block. The alternative — gating the
  pack step and building the release's asset list conditionally — is real bash
  complexity bought to defer a two-minute task.
- `bump.mjs` already discovers every `extensions/*/src/manifest.json` and writes
  the version to all of them, and `check-version.mjs` refuses a disagreeing tag,
  so the second extension needs no change there and no new version-guard test.
- `PRIVACY.md` — currently written as though YouTube is the only extension: it
  describes "the one network request" and names a content script on
  `www.youtube.com`. It needs restructuring so the shared promise stays at the
  top and the per-extension specifics sit under it. LinkedIn's entry is the
  short one: no network requests at all, in any configuration.
- `README.md` — a row in the extensions table, a section describing the
  switches, the Verification note above, the new secret and variables, and the
  updated developer commands.

## Out of scope

- **The Chrome Web Store listing.** Firefox first, matching the YouTube
  extension's current state. The CWS step is gated on `LINKEDIN_CWS_ITEM_ID`,
  so it skips until the listing exists, and `publish-stores.yml` can then push
  an already-shipped tag to it without inventing a version.
- **system-setups.** Adding `PeaceBeStill - LinkedIn` to the Firefox and
  Chromium enterprise policy lists is a separate job in a separate repository,
  taken up once this extension has shipped a release with assets to point at.
- **Committed fixtures.** As above: pages read in the dev profile stay out of
  the repository.
- **A CI audit.** The check needs a signed-in profile, so it is run by hand and
  CI keeps to the unit tests and the linter.
- **Guessed selectors.** No switch ships against markup that has not been read
  and then checked in a browser.

## Workflow

1. Build the chassis: manifest, `core.js`, `content.js`, `hide.css`, options
   page, icons, unit tests, the `package.json`, `release.yml`,
   `publish-stores.yml`, `PRIVACY.md` and README changes. `web-ext lint` clean,
   `npm test` green.
2. Check `blackout` and the redirects by hand — Firefox `about:debugging` →
   Load Temporary Add-on, and Firefox for Android.
3. Generate the CRX key, add `LINKEDIN_CRX_PRIVATE_KEY`, tag a release, and
   confirm it carries eight assets and that both new update manifests parse.
4. Create the AMO listing by hand, set `LINKEDIN_AMO_SLUG`, and dispatch
   `publish-stores.yml` for the tag already shipped.
5. Thereafter, one pasted page at a time: read the markup, add the switches,
   check them in a browser, commit.

## Acceptance

- A fresh install changes nothing about LinkedIn, and stores nothing.
- With `blackout` on, every LinkedIn page shows only "You made the right
  choice." in regular-size text, readable in both light and dark mode, and the
  tab title says the same; turning it off restores the site with every other
  switch exactly as it was left.
- With `blackout` on, every other switch on the options page is greyed out,
  keeps its tick, stays in the tab order, refuses changes, and names the switch
  that locked it; `data-peacebestill` reads exactly `blackout`.
- Each redirect switch sends the home page to its destination and leaves every
  other page alone; with more than one on, the first in table order wins.
- With `notificationCount` on, the tab title loses its leading "(3) " and keeps
  it off as LinkedIn navigates.
- All five switches behave the same on Firefox for Android as on the desktop.
- The extension makes no network requests at all, in any configuration.
- Toggling on the options page changes open tabs without a reload.
- The source tree carries no `update_url`; the self-hosted build carries both,
  and a distinct Firefox ID.
- A tagged release yields a Mozilla-signed XPI, a CRX with a stable ID, and two
  valid update manifests for **each** extension, all at constant URLs, with the
  store steps skipping cleanly while their listings do not exist.
