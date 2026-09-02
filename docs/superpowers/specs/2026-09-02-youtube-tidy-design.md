# YouTube Tidy — design

Date: 2026-09-02. Status: approved in conversation, awaiting implementation plan.

## Goal

A tiny, self-built browser extension that hides a handful of things on desktop
YouTube and expands the video description, each behind its own switch, and that
every machine provisioned by `system-setups` installs and updates automatically
through the same enterprise-policy mechanism its other extensions use.

Unhook stays installed; this covers what Unhook does not.

## Features

Every feature is a toggle on the options page, on by default except
`dislikeCount`. Selectors below
are the starting point; the audit step (see Workflow) confirms or corrects them
against the live page, because YouTube's DOM is not documented and changes.

| Key                       | Hides / does                                              | Initial selector(s)                                                                                                                   |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `create`                  | the Create button in the header                           | `ytd-masthead #buttons :is(ytd-button-renderer, ytd-topbar-menu-button-renderer):has(button[aria-label="Create"])`                    |
| `moreFromYoutube`         | the "More from YouTube" sidebar section                   | `ytd-guide-section-renderer:has(a[href*="music.youtube.com"])`                                                                        |
| `subscriptionDots`        | the new-video dot beside channels in the Subscriptions list | `ytd-guide-entry-renderer #newness-dot`                                                                                             |
| `expandDescription`       | opens the collapsed description on every watch page       | click `#description-inline-expander:not([is-expanded]) #expand` after load and after each `yt-navigate-finish`                       |
| `descriptionChannelLinks` | the channel row at the bottom of the description          | `ytd-video-description-infocards-section-renderer`                                                                                    |
| `descriptionCards`        | the transcript / podcast / chapters / course / music cards | `ytd-video-description-transcript-section-renderer, ytd-video-description-course-section-renderer, ytd-video-description-music-section-renderer, #description ytd-horizontal-card-list-renderer` |
| `descriptionChips`        | hashtags above the title and link chips inside the text   | `ytd-watch-metadata #super-title`, `#description a[href^="/hashtag/"]` (audit: in-text URL chips)                                     |
| `footer`                  | the About / Press / Copyright block under the sidebar     | `ytd-guide-renderer #footer`                                                                                                          |
| `titleCase`               | rewrites ALL-CAPS video titles in sentence case           | text nodes under `#video-title, a#video-title-link, ytd-watch-metadata h1 yt-formatted-string`, re-checked by a debounced observer |
| `dislikeCount`            | shows the dislike count next to the dislike button (**off by default**, see below) | fetch `https://returnyoutubedislikeapi.com/votes?videoId=<id>`; append a span inside `dislike-button-view-model button`       |

`titleCase` only touches a title that is shouting (at least six letters, 80 % or
more of them upper case); it lower-cases it, then capitalises the start of each
sentence and the pronoun I. Titles render and re-render as YouTube streams
results in, so this is the one feature that keeps a `MutationObserver` running
(debounced, disconnected when the switch is off). It edits text nodes only,
never replaces elements, so YouTube's own markup is left intact.

`dislikeCount` is the one feature that is off until switched on: YouTube stopped
publishing dislikes in 2021, so the number comes from the Return YouTube Dislike
service, which means telling a third party which video is being watched. The
service answers JSON (`dislikes`, `likes`, ...) with `Access-Control-Allow-Origin: *`,
so a plain content-script `fetch` works with no extra permission. The count is
shown compactly (`1.2K`, `3.4M`), re-fetched on each watch-page navigation, and
removed when the switch is turned off.

Mozilla requires new extensions to declare what they collect. The manifest
declares `data_collection_permissions` as required `none`, optional
`browsingActivity`, and ticking `dislikeCount` on the options page requests that
optional data-collection permission in Firefox (Chromium has no such API and
skips the request); if it is declined the box unticks itself.

Out of scope: mobile YouTube, the Shorts player UI, anything Unhook already does.

## Architecture

Manifest V3, one codebase for Firefox and Chromium, no background script, no
build step for the extension files themselves.

- `manifest.json` — `permissions: ["storage"]`; one content script on
  `*://www.youtube.com/*` at `document_start` with `tidy.css` and `content.js`;
  `options_ui` (embedded, not a tab); `browser_specific_settings.gecko`
  with `id: youtube-tidy@peacebestill.fyi`, `strict_min_version` for MV3, and
  `update_url` pointing at the release manifest below; a top-level `update_url`
  for Chromium.
- `tidy.css` — one rule per feature, each gated on a token in a single attribute
  on the root element, e.g. `html[data-yt-tidy~="create"] … { display: none !important }`.
  Gating on the root element means a toggle takes effect in open tabs instantly
  and the stylesheet ships fully static.
- `content.js` — reads the settings from `storage.sync` (missing key = that
  feature's default, on for all but `dislikeCount`), keeps ALL-CAPS titles
  calmed through the observer described above,
  writes the enabled keys into `document.documentElement.dataset.ytTidy`, and
  re-applies on `storage.onChanged`. For `expandDescription` it listens for
  YouTube's `yt-navigate-finish` event plus initial load, then looks for the
  collapsed expander with a short retry loop (the watch page renders after
  navigation), clicks it once, and stops. No observers left running. For
  `dislikeCount` it fetches the count for the current video ID on the same
  events and writes it into a span inside the dislike button, retrying briefly
  for the button the same way; a navigation or a switch-off removes the span.
- `options.html` / `options.js` / `options.css` — one checkbox per key bound to
  `storage.sync`. A one-line namespace shim (`globalThis.browser ?? chrome`)
  is the only browser difference.
- `icons/` — one SVG-derived PNG set.

## Distribution

A public GitHub repository, `nascosto/youtube-tidy`, so the browsers can fetch
release assets anonymously (`system-setups` is private, so it cannot host them).

A GitHub Actions workflow runs on a `v*` tag and fails unless the tag equals the
manifest version. It:

1. runs `web-ext lint`;
2. signs the package through Mozilla's self-distribution ("unlisted") channel
   with `web-ext sign`, producing the signed XPI;
3. packs a CRX3 with a fixed private key held as a repository secret, and
   derives the Chromium extension ID from that key;
4. generates the two update manifests — `updates.json` for Firefox and
   `updates.xml` for Chromium — pointing at that release's assets;
5. creates the GitHub release for the tag with four assets under constant
   names: `youtube-tidy.xpi`, `youtube-tidy.crx`, `updates.json`, `updates.xml`.

Constant names give stable "latest" URLs of the form
`https://github.com/nascosto/youtube-tidy/releases/latest/download/<asset>`,
which is what the policies and the manifest `update_url`s use; the update
manifests inside a release point at that release's own versioned URLs
(`releases/download/<tag>/<asset>`).

Secrets, set once: the Mozilla add-ons API key pair (`AMO_JWT_ISSUER`,
`AMO_JWT_SECRET`) and the CRX private key (`CRX_PRIVATE_KEY`, PEM).

The CRX packing tool is decided in the implementation plan (Chromium's own
`--pack-extension` on the runner versus a pinned packing library); the
constraint is a stable ID from the same key on every release.

## Integration with system-setups

One entry per browser list, the same shape as Bypass Paywalls Clean:

- Firefox (Linux and Windows): `youtube-tidy@peacebestill.fyi`, `normal_installed`,
  `install_url` = the latest `youtube-tidy.xpi` URL.
- Chromium on Linux: the derived ID, `normal_installed`, `update_url` = the
  latest `updates.xml` URL. Windows: `allowed` only, hand-installed once, as
  Chromium there refuses off-store force-installs on an unmanaged machine; the
  existing `lib/browser-policy.test.py` already permits exactly that exception.
- README note alongside the existing browser-extension notes.

## Workflow

1. Write the extension. `web-ext lint` clean.
2. Audit: load it unpacked in Firefox (about:debugging, temporary add-on) and
   Chromium (chrome://extensions, developer mode, load unpacked) on this
   machine; check every toggle on the home page, a watch page, and the
   Subscriptions sidebar; fix selectors; repeat until each switch hides exactly
   its element and description expansion survives navigating between videos.
3. Create the public repo, add the three secrets, push, tag `v1.0.0`, confirm
   the release carries the four assets and that both update manifests parse.
4. Add the policy entries to `system-setups` on a branch; run its test suite;
   apply on this machine; confirm both browsers installed it from the policy.

Signing and CI come after the audit, so nothing is uploaded until the
extension is right.

## Acceptance

- Each toggle hides exactly its element and nothing else, in both browsers.
- Description expansion works on first load and after navigating to another
  video, and does nothing when the description is already open.
- An ALL-CAPS title reads in sentence case on the home grid, in the watch
  page's heading and in its sidebar, including titles that arrive by scrolling;
  a normally cased title is untouched; switching the feature off stops further
  rewriting.
- With `dislikeCount` on, a watch page shows a compact dislike count beside the
  dislike button within a couple of seconds, it changes when navigating to
  another video, and switching it off removes it; with it off (the default) the
  extension makes no network requests at all.
- Toggling on the options page changes open tabs without a reload.
- A tagged release yields a Mozilla-signed XPI, a CRX with the stable ID, and
  two valid update manifests, all at the constant URLs.
- Both browsers on this machine install it from the policy alone.
