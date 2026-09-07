# PeaceBeStill - YouTube — design

Date: 2026-09-02. Status: approved in conversation, awaiting implementation plan.

## Goal

A tiny, self-built browser extension that hides a handful of things on desktop
YouTube and expands the video description, each behind its own switch, and that
every machine provisioned by `system-setups` installs and updates automatically
through the same enterprise-policy mechanism its other extensions use.

Unhook's options are ported (2026-09-03), so Unhook is dropped from the system-setups policy lists; this is the one YouTube extension.

## Features

Every feature is a toggle on the options page, and **every one is off out of
the box**: a fresh install changes nothing about YouTube until you switch
something on. That also keeps the synced settings to exactly the switches you
turned on, since a value equal to its default is never stored.

Each toggle is nested under the switch it depends on (a switch that hides the thing a feature acts on makes that feature
moot: it is indented under it, muted and locked while the parent is on, its
stored value untouched, and a note names the switch that locked it). A locked
switch is marked `aria-disabled` rather than `disabled`, so it stays in the tab
order and can still be read; a change to one is refused and the tick put back.

The page also carries a filter box, a count of how many switches are on, a note
that settings follow the browser account, a button that turns everything off,
and a status line that says so when a write to storage fails rather than
looking saved.

The content script never reads stored settings directly. `effective()` fills in
the defaults and forces off anything a parent has made moot, and every guard
tests for truth, so an absent key -- which is every key on a fresh install,
since only non-default values are stored -- can never be mistaken for on. The parents: `header` over `create` and `notifications`; `subscriptions`
over `subscriptionDots`, `upcoming` and `homeToSubscriptions`; `description`
over `expandDescription`, `descriptionChannelLinks`, `descriptionCards`,
`descriptionChips` and `summary`; `relatedVideos` over `recommended`,
`liveChat` and `playlistPanel`; `comments` over `profilePhotos`; `buttonsBar`
over `dislikeCount`. `ask` stays top level: its card is in the description but
its button is in the buttons row.

Toggles are grouped under section headings (Header and sidebar, Home and feeds, Watch page, Player, Search,
Channel pages). Selectors below
are the starting point; the audit step (see Workflow) confirms or corrects them
against the live page, because YouTube's DOM is not documented and changes.

| Key                       | Hides / does                                              | Initial selector(s)                                                                                                                   |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `create`                  | the Create button in the header                           | `ytd-masthead #buttons :is(ytd-button-renderer, ytd-topbar-menu-button-renderer):has(button[aria-label="Create"])`                    |
| `moreFromYoutube`         | the "More from YouTube" sidebar section                   | `ytd-guide-section-renderer:has(a[href*="music.youtube.com"])`                                                                        |
| `subscriptionDots`        | the new-video dot beside channels in the Subscriptions list | `ytd-guide-entry-renderer #newness-dot` (expanded sidebar) and `yt-list-item-view-model .ytListItemViewModelNewContentIndicator` (the flyout the mini sidebar shows on hovering Subscriptions) |
| `expandDescription`       | opens the collapsed description on every watch page, and hides its "Show less" | click `#description-inline-expander:not([is-expanded]) #expand` after load and after each `yt-navigate-finish`; hide `#description-inline-expander #collapse`; and, while nothing in `#structured-description` is rendered, zero its 16px top margin so the box ends at the text (content.js, re-checked by the observer) |
| `descriptionChannelLinks` | the channel row at the bottom of the description          | `ytd-video-description-infocards-section-renderer`                                                                                    |
| `descriptionCards`        | the transcript / podcast / chapters / course / music cards and the "How this was made" (auto-dubbed) block | `ytd-video-description-transcript-section-renderer, ytd-video-description-course-section-renderer, ytd-video-description-music-section-renderer, #description ytd-horizontal-card-list-renderer, how-this-was-made-section-view-model` |
| `descriptionChips`        | hashtags above the title and link chips inside the text   | `ytd-watch-metadata #super-title`, `#description a[href^="/hashtag/"]` (audit: in-text URL chips)                                     |
| `footer`                  | the About / Press / Copyright block under the sidebar     | `ytd-guide-renderer #footer`                                                                                                          |
| `ask`                     | YouTube's AI "Ask": the card in the description and the button under the video | `yt-video-description-youchat-section-view-model`, `ytd-menu-renderer yt-button-view-model:has(.you-chat-entrypoint-button)` |
| `summary`                 | the AI-generated "Summary" block in the description       | `ytd-structured-description-content-renderer #video-summary` |
| `upcoming`                | upcoming videos (and their Notify me button) in the Subscriptions feed | `ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:has(lockup-attachments-view-model toggle-button-view-model)` (only upcoming cards carry that toggle); older grid markup via `ytd-rich-grid-media ytd-toggle-button-renderer` |
| `channelTabs`             | a channel's Posts and Store tabs                          | `yt-tab-shape:is([tab-title="Posts"], [tab-title="Store"])` |
| `channelTabRedirect`      | a direct visit to a channel's Posts or Store page goes to the channel home | content.js `location.replace(channelHomeFor(pathname))` on load and navigation |
| `stalePlaceholders`       | the "loading more" block (ghost cards, spinner) left behind at the end of a feed | content.js: a `ytd-rich-grid-renderer ytd-continuation-item-renderer` that has sat in view for 6 s with the grid's item count unchanged is hidden; any growth of the grid shows it again (`placeholderVerdict`, driven by the observer, a scroll listener and a timer) |
| `header`                  | the whole top bar                                         | `#masthead-container`; plus `ytd-app #page-manager { margin-top: 0 }` so the page does not keep the gap |
| `notifications`           | the bell, and the unread count in the tab title           | `ytd-masthead ytd-notification-topbar-button-renderer`; content.js strips `^\(\d+\) ` from `document.title` (`untitled`) |
| `exploreTrending`         | the Explore section, the Trending/Explore entries, those pages | `ytd-guide-section-renderer:has(a[href^="/feed/storefront"], …)`, the guide / mini-guide entries, `ytd-browse[page-subtype="trending"]` |
| `subscriptions`           | the Subscriptions entry, channel-list section and feed page | `ytd-guide-entry-renderer:has(a[href^="/feed/subscriptions"])`, mini-guide entry, `ytd-guide-section-renderer:has(a[href^="/feed/subscriptions"])`, `ytd-browse[page-subtype="subscriptions"]` |
| `homeFeed`                | the home page feed                                        | `ytd-browse[page-subtype="home"] ytd-rich-grid-renderer` |
| `homeToSubscriptions`     | the home page goes to the Subscriptions feed (never when that is hidden) | content.js `redirectFor`: `/` → `/feed/subscriptions` |
| `shorts`                  | Shorts everywhere; a Short opens as a normal video        | shelves, grids, items with `a[href*="/shorts/"]`, guide / mini-guide entries with `a[title="Shorts"]`, `yt-tab-shape[tab-title="Shorts"]`, the results chip, notifications, `ytd-shorts`; content.js `/shorts/<id>` → `/watch?v=<id>` |
| `mixes`                   | auto-generated playlists                                  | `ytd-rich-item-renderer:has(a[href*="start_radio=1"], a[href*="list=RD"])`, `ytd-compact-radio-renderer`, `ytd-radio-renderer`, `yt-lockup-view-model:has(a[href*="list=RD"])`, `.ytp-videowall-still[data-is-mix="true"]` |
| `promos`                  | YouTube's own promos and surveys (third-party ads are `ads`)                          | `#masthead-ad`, `ytd-mealbar-promo-renderer`, `ytd-primetime-promo-renderer`, `ytd-statement-banner-renderer`, `#surveys`, survey renderers |
| `relatedVideos`           | the whole column beside the video                         | `ytd-watch-flexy #secondary` |
| `recommended`             | the recommendation list in that column; the pause overlay | `ytd-watch-next-secondary-results-renderer #items`, `.ytp-pause-overlay` |
| `liveChat`                | live chat                                                 | `ytd-live-chat-frame` |
| `playlistPanel`           | the playlist panel beside the video                       | `ytd-watch-flexy ytd-playlist-panel-renderer#playlist` |
| `fundraiser`              | the fundraiser shelf                                      | `ytd-donation-shelf-renderer` |
| `merch`                   | merch, tickets, offers, context boxes                     | `ytd-merch-shelf-renderer`, `#ticket-shelf`, `#offer-module`, `#clarify-box` |
| `comments`                | comments                                                  | `ytd-comments#comments`, `#comment-teaser` |
| `profilePhotos`           | profile photos in comments                                | `ytd-comments #author-thumbnail` |
| `videoInfo`               | the views and date line (Unhook hid the whole metadata block; this is narrower on purpose) | `ytd-watch-metadata #info-container` |
| `buttonsBar`              | the like / share / save row                               | `ytd-watch-metadata #actions` |
| `channelRow`              | the channel row under the video                           | `ytd-watch-metadata #owner` |
| `description`             | the description                                           | `ytd-watch-metadata #description` |
| `autoplay`                | autoplay off; its toggle and countdown hidden             | content.js clicks `.ytp-autonav-toggle-button[aria-checked="true"]` once per watch page (YouTube remembers it); CSS hides the toggle and `.ytp-autonav-endscreen-countdown-overlay`. Next/previous buttons stay, unlike Unhook |
| `endScreenFeed`           | the video wall when a video ends                          | `.html5-endscreen` |
| `endScreenCards`          | end-screen cards                                          | `.ytp-ce-element`, `.ytp-ce-hide-button-container` |
| `annotations`             | info cards, the cards button, the channel watermark       | `.ytp-cards-teaser`, `.ytp-cards-button`, `.iv-branding`, `.ytp-iv-video-content` |
| `searchShelves`           | shelves in search results                                 | `ytd-two-column-search-results-renderer #primary :is(ytd-shelf-renderer, ytd-horizontal-card-list-renderer)` |
| `ads`                     | ads in the page: feed slots, promoted results, display and companion ads | `ytd-ad-slot-renderer`, `ytd-in-feed-ad-layout-renderer`, `ytd-companion-slot-renderer`, `ytd-player-legacy-desktop-watch-ads-renderer`, `ytd-ads-engagement-panel-content-renderer`, `#player-ads`, `#masthead-ad`, plus the `ytd-promoted-*` and `ytd-display-ad-renderer` names. Ads *inside* the video are out of scope: a pre-roll is the same video element playing other content, and a filter list maintained daily beats anything hand-written here, so uBlock Origin keeps that job. `#sponsor-button` and `#sponsor-comment-badge` are channel memberships, not advertising, and are deliberately left alone. |
| `titleCase`               | rewrites ALL-CAPS video titles in sentence case           | text nodes under `#video-title, a#video-title-link, ytd-watch-metadata h1 yt-formatted-string, yt-lockup-metadata-view-model h3 a` (the last is YouTube's newer "lockup" markup, used by the watch sidebar and home grid), re-checked by a debounced observer |
| `dislikeCount`            | shows the dislike count next to the dislike button (**off by default**, see below) | fetch `https://returnyoutubedislikeapi.com/votes?videoId=<id>`; append a span inside the *rendered* `dislike-button-view-model button` (the page keeps hidden duplicates) and drop the button's icon-only class so the number is not clipped |

`titleCase` only touches a title that is shouting (at least six letters, 80 % or
more of them upper case); it lower-cases it, then capitalises the start of each
sentence and the pronoun I. Titles render and re-render as YouTube streams
results in, so this is the one feature that keeps a `MutationObserver` running
(debounced, disconnected when the switch is off). It edits text nodes only,
never replaces elements, so YouTube's own markup is left intact.

`dislikeCount` is worth reading about before switching on: YouTube stopped
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

Audited 2026-09-03 with `npm run audit:chromium` (Chromium 151) and
`npm run audit:firefox` (Firefox 155), signed out, on a live watch page: every
description target present and not rendered, description expanded on arrival
and after navigation, the sidebar dots and footer hidden, a switch flipped from
the options page applied to the open tab, a shouting title calmed live, the
dislike count rendered beside the thumbs-down. Not verifiable signed out, still
to check by hand: the Create button, the subscription dots with real
subscriptions, and Firefox's rendering of the More from YouTube section.

Out of scope: mobile YouTube, the Shorts player UI, anything Unhook already does.

## Architecture

Manifest V3, one codebase for Firefox and Chromium, no background script, no
build step for the extension files themselves.

- `manifest.json` — `permissions: ["storage"]`; one content script on
  `*://www.youtube.com/*` at `document_start` with `hide.css` and `content.js`;
  `options_ui` (embedded, not a tab); `browser_specific_settings.gecko`
  with `id: youtube@peacebestill.fyi`, `strict_min_version` for MV3, and
  `update_url` pointing at the release manifest below; a top-level `update_url`
  for Chromium.
- `hide.css` — one rule per feature, each gated on a token in a single attribute
  on the root element, e.g. `html[data-peacebestill~="create"] … { display: none !important }`.
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

A public GitHub repository, `nascosto/PeaceBeStill`, so the browsers can fetch
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
   names: `peacebestill-youtube.xpi`, `peacebestill-youtube.crx`, `updates.json`, `updates.xml`.

Constant names give stable "latest" URLs of the form
`https://github.com/nascosto/PeaceBeStill/releases/latest/download/<asset>`,
which is what the policies and the manifest `update_url`s use; the update
manifests inside a release point at that release's own versioned URLs
(`releases/download/<tag>/<asset>`).

Secrets, set once: the Mozilla add-ons API key pair (`AMO_JWT_ISSUER`,
`AMO_JWT_SECRET`) and the CRX private key (`YOUTUBE_YOUTUBE_CRX_PRIVATE_KEY`, PEM).

The CRX packing tool is decided in the implementation plan (Chromium's own
`--pack-extension` on the runner versus a pinned packing library); the
constraint is a stable ID from the same key on every release.

## Integration with system-setups

Chromium ID (derived from the CRX signing key, `~/.config/peacebestill/youtube-crx-key.pem`): `pdhfbnmgmbemgfeeeojggeejahfaaijn`

One entry per browser list, the same shape as Bypass Paywalls Clean:

- Firefox (Linux and Windows): `youtube@peacebestill.fyi`, `normal_installed`,
  `install_url` = the latest `peacebestill-youtube.xpi` URL.
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
