# PeaceBeStill

Quiet the web down. A family of small extensions, one per site, that hide the
parts you never use. **Everything is off until you switch it on**: a fresh
install changes nothing at all.

| Extension | Site | Source |
| --- | --- | --- |
| PeaceBeStill - YouTube | www.youtube.com | [`extensions/youtube`](extensions/youtube) |

Each extension is Manifest V3, works in both Firefox and Chromium from one
codebase, has no background script, asks only for the `storage` permission,
and runs only on its own site.

## PeaceBeStill - YouTube

Every feature is a switch on the options page, grouped by where it acts and
nested under the switch it depends on, so hiding the description greys out the
five switches for things inside it.

- the Create button, the whole top bar, the notifications bell and the unread
  count in the tab title
- sidebar clutter: "More from YouTube", Explore and Trending, Subscriptions,
  the new-video dots beside channels, the About / Press / Copyright block
- feeds: the home feed (or send home straight to Subscriptions), Shorts
  everywhere (a Short opens as a normal video), Mixes, promo banners and
  surveys, upcoming videos and their Notify me button, and the loading
  placeholders a feed leaves behind at its end
- the watch page: the whole column beside the video or just its
  recommendations, live chat, the playlist panel, fundraisers, merch, comments
  and their profile photos, the views line, buttons row and channel row
- the description: opened automatically with its "Show less" dropped, and its
  channel row, its transcript / podcast / chapters / music and "How this was
  made" cards, its hashtags and link chips, YouTube's AI "Ask" card and button,
  and the AI-generated summary
- the player: autoplay switched off with its toggle hidden, the end-screen
  video wall and cards, info cards and the channel watermark
- search: the For you / People also watched shelves
- channel pages: the Posts and Store tabs, and landing on one of those pages
  goes to the channel home instead
- ALL-CAPS titles rewritten in sentence case
- ads in the page: feed slots, promoted results, display and companion ads.
  Ads *inside* the video are out of scope, since a pre-roll is the same video
  element playing other content and a daily-updated filter list beats anything
  hand-written; keep uBlock Origin for those. Channel memberships, which
  YouTube also calls sponsorships, are deliberately left alone.
- the dislike count beside the thumbs-down: it comes from the Return YouTube
  Dislike service, so turning it on tells that service which video you are
  watching. It is the only switch that makes a network request, and Firefox
  treats it as an optional data-collection permission, asking you once when
  you tick the box.

The options page has a filter box, a count of what is on, a button that turns
everything off, and a note that settings follow your browser account.

### Firefox for Android

The extension declares `gecko_android` and its content script matches
`m.youtube.com`, so it installs and runs on Firefox for Android. Chrome for
Android supports no extensions at all, so Android means Firefox.

Mobile YouTube is a separate application, not a narrow desktop one: `ytm-*`
components, a bottom pivot bar in place of the sidebar, and the video's
metadata inline under the player rather than in a column beside it. So the
desktop rules match nothing there and `hide.css` carries a second set. Thirteen
switches work on mobile: the top bar, Create, notifications, Subscriptions,
Shorts, the home feed, promos, the recommendations and the videos in them, the
views line, the buttons row, the channel row, and in-page ads.

The rest do nothing on a phone, which costs nothing, since an unmatched
selector hides nothing and every switch is off until you turn it on. They fall
into three groups: those needing a sidebar mobile does not have ("More from
YouTube", the About/Press/Copyright block, Explore and Trending, the
subscription dots); those inside the player, whose mobile controls are a
different component (autoplay, the end-screen wall and cards, info cards); and
those whose mobile equivalent is not yet written -- comments and their photos,
the description's sub-switches, mixes, upcoming videos, search shelves,
fundraisers, merch, live chat and the playlist panel.

### How it works

`content.js` keeps a `data-peacebestill` attribute on `<html>` equal to the
enabled feature keys; `hide.css` has one `display: none` rule per feature gated
on that attribute, so toggles apply to open tabs instantly. The same script
opens the description, calms shouting titles, prunes stale feed placeholders
and, when asked, fetches the dislike count. `core.js` holds the feature list
that the content script, the options page and both audits all read.

Settings live in `storage.sync`, so they follow your Firefox or Chrome account.
Only switches that differ from their default are stored, so a profile on the
defaults stores nothing at all.

## Developing

    npm install
    npm test                 # node --test, across the shared tooling and every extension
    npm run lint             # web-ext lint
    npm run build            # both packages per extension, into dist/
    npm run bump patch       # one version across package.json and every manifest
    npm run start:firefox    # throwaway Firefox profile with the extension loaded
    npm run start:chromium

To try it in your real, signed-in profile: Firefox → `about:debugging` → This
Firefox → Load Temporary Add-on → `extensions/youtube/src/manifest.json`;
Chromium → `chrome://extensions` → Developer mode → Load unpacked →
`extensions/youtube/src`.

A site's markup is undocumented and changes. When a switch stops working, run
the audits, which drive a signed-out headless browser through a live page and
report, per switch, how many targets exist and how many are still rendered
(screenshots land in `extensions/youtube/audit/out/`):

    npm run audit:chromium    # puppeteer-core against /usr/bin/chromium-browser
    npm run audit:firefox     # Marionette against /usr/bin/firefox, no driver needed

Both run two passes: first every child switch on with the parents off, so each
child has a visible container to act inside, then the parents as well. Turning
everything on at once tells you nothing, because a parent hides the container
its children live in. The Create button and the subscription dots only exist
signed in, so those two are checked by hand.

## Layout

```
extensions/<site>/src     the extension itself
extensions/<site>/test    its unit tests
extensions/<site>/audit   its live-page audits
scripts/                  release tooling, shared by every extension
test/                     tests for that tooling, and the shared test helper
```

## Releasing

Releases are built by `.github/workflows/release.yml` from a version tag. Every
extension in the repo shares the repo's version, and one release carries them
all, so the tag must equal `v` + the version in each `manifest.json`.

    npm run bump patch      # or minor, major, or an exact 1.2.3
    git commit -am "Release 1.0.1"
    git tag v1.0.1 && git push origin main v1.0.1

`npm run bump` writes the new version to `package.json` and to every
extension's manifest at once, which is the one part of a release that reliably
goes wrong by hand; `scripts/check-version.mjs` then refuses any tag that
disagrees with them.

Each extension goes out down four channels, built from two packages:

| Channel | Package | Add-on ID | Updates come from |
| --- | --- | --- | --- |
| addons.mozilla.org | the source tree | `youtube@peacebestill.fyi` | Mozilla |
| Chrome Web Store | the source tree | assigned by Google | Google |
| Self-hosted Firefox | + `update_url`s, own ID | `youtube-selfhosted@peacebestill.fyi` | the `.json` below |
| Self-hosted Chromium | + `update_url`s | derived from the CRX key | the `.xml` below |

Both stores reject a package that names its own update service, so the source
tree carries no `update_url` at all and `scripts/variant.mjs` adds the two keys
back for the self-hosted build. That build also takes its own Firefox ID,
because AMO holds a version number once per add-on across its listed and
unlisted channels and a release publishes the same version to both. Chromium
needs no such split: the store assigns its own ID there, and the self-hosted
one comes from the signing key rather than the manifest.

The GitHub release is created before either store submission, so a queued or
rejected review never costs the self-hosted channel. Its four assets keep
constant names, so these URLs are always the newest version:

    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.xpi
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.crx
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.json
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.xml

### First listing on each store, by hand

Neither store's API can create a listing: the first submission carries the
description, screenshots, category and data-use answers, and only the web UI
asks for those. Do each one once, then CI handles every version after it. Both
listings take <contact@peacebestill.fyi> as the contact address and
[PRIVACY.md](PRIVACY.md) as the privacy policy. A
store step whose credentials are missing is skipped rather than failed, so
tagging works before either listing exists. To publish a version that shipped
before its listing did, run the **publish-stores** workflow from the Actions
tab with that tag: it submits an existing tag to whichever stores are
configured, without inventing a version number nobody needed. It is also the
way back from a rejection — fix the listing, dispatch the same tag again.

- **addons.mozilla.org** — submit `dist/peacebestill-youtube-store.zip` as a
  *listed* add-on, with <https://github.com/nascosto/PeaceBeStill/blob/main/PRIVACY.md>
  as the privacy policy.
- **Chrome Web Store** — a one-off $5 developer registration, then create the
  item, and put the ID it assigns in the repository variable
  `YOUTUBE_CWS_ITEM_ID`. The listing must answer the data-use questions: the
  dislike count is the only outbound request, it is off by default, and
  `PRIVACY.md` is the policy to link.

### Secrets (repository settings → Secrets and variables → Actions)

| Secret | Where it comes from |
| --- | --- |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | https://addons.mozilla.org/developers/addon/api/key/ (a free Mozilla account, and one pair signs every extension on both channels) |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` | a Google Cloud OAuth client with the Chrome Web Store API enabled, authorised once against the developer account |
| `YOUTUBE_CRX_PRIVATE_KEY` | the PEM generated below; the self-hosted Chromium ID is derived from it, so it must never change |

And one variable, not a secret: `YOUTUBE_CWS_ITEM_ID`, the store's ID for the
item.

    mkdir -p ~/.config/peacebestill
    openssl genrsa -out ~/.config/peacebestill/youtube-crx-key.pem 2048
    node scripts/pack-crx.mjs --key ~/.config/peacebestill/youtube-crx-key.pem --id   # the Chromium ID

Each extension needs its own key, since the Chromium ID is derived from it and
two extensions cannot share an ID. Keep the PEMs out of the repo (`.gitignore`
already excludes `*.pem`).

## Licence and privacy

MIT, see [LICENSE](LICENSE). Nothing is collected: see [PRIVACY.md](PRIVACY.md).
To report a security issue, see [SECURITY.md](SECURITY.md) — please do it
privately rather than in an issue.

## Installing

From the stores, once the listings are up, or straight from a release. A
store copy and a self-hosted copy are different add-ons to the browser and can
be installed at the same time, so pick one: everything being off by default,
two copies do nothing visible but waste effort.

Firefox will install the self-hosted `.xpi` from its URL above. Chrome and
Edge will not — off-store installs are blocked outside a managed machine — so
on Chromium the self-hosted `.crx` is really for machines you administer.

[system-setups](https://github.com/nascosto/system-setups) does that
administering: it installs these through Firefox's and Chromium's enterprise
policies, so every profile on the machine gets them without being asked.
