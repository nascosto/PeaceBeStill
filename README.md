# PeaceBeStill

Quiet the web down. A family of small extensions, one per site, that hide the
parts you never use. **Everything is off until you switch it on**: a fresh
install changes nothing at all.

| Extension | Site | Source |
| --- | --- | --- |
| PeaceBeStill - YouTube | www.youtube.com | [`extensions/youtube`](extensions/youtube) |
| PeaceBeStill - LinkedIn | www.linkedin.com | [`extensions/linkedin`](extensions/linkedin) |

Each extension is Manifest V3, works in both Firefox and Chromium from one
codebase, has no background script, asks only for the `storage` permission,
and runs only on its own site.

## PeaceBeStill - YouTube

> Make YouTube "Be Still". Fully configurable with 43 switches.

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

## PeaceBeStill - LinkedIn

Thirty-four settings, and the first one is the blunt one.

- **Hide everything** — every page on the site becomes one
  line of ordinary text reading "You made the right choice." It is the whole
  site, with no exceptions; to use LinkedIn again you turn it off. While it is
  on, every other switch is greyed out and says so, because none of them can
  matter when there is no page left to act on.
- **the pages**, one switch each: Home, My Network, Jobs, Messaging,
  Notifications and Profile. A page switch takes the page itself as well as its
  place in the top bar, which is why everything belonging to a page sits under
  it — the feed and its posts under Home, the chat overlay under Messaging, the
  unread tab count under Notifications
- the feed: hide it entirely, or just the "Start a post" box, suggested posts,
  "Recommended for you", and posts someone in your network liked or commented on
- **where the home page goes instead**, chosen from a list rather than ticked.
  Somewhere you have hidden is not offered, and not obeyed if it was chosen
  before you hid it
- **advertisements**, under one switch that covers the lot, with the kinds
  under it if you want them separately: in the feed, outside it, Premium
  upsells, and promoted job adverts
- the puzzles and games, the LinkedIn News panel, business features, "People
  you may know", the "suggestions for you" panels, the site footer, and
  LinkedIn's AI assistant. A few of these can be hidden everywhere or on one
  page only: ticking the global one ticks and locks the smaller ones under it
- **the prompts to install the app**, which only the mobile site shows: the bar
  pinned along the bottom, and the sheet that covers the page and holds it
  still until it is dismissed

Turning a switch on takes away the settings it covers: with **Hide everything**
on there is one switch left on the page, because there is nothing else to
decide. Their stored values are untouched, so turning it back off brings them
back exactly as they were.

**On a phone, most of this does not work yet.** LinkedIn serves a third site
to mobile browsers, sharing no markup with either of the two it serves a
desktop: no `data-testid` anywhere, no `role="listitem"`, no `<aside>`, no
site footer. Measured against it, what works today is **Hide everything**,
**where the home page goes instead**, and the app prompts written for it.
The rest need a third set of selectors, and until they have one they do
nothing there. The options page itself is built for a phone screen.

### How it works, and why it is not all CSS

Some of LinkedIn's overlays -- the chat bubble, the assistant -- live in a
shadow root on `div#interop-outlet`, and a content script's stylesheet does not
cross that boundary. `hide.css` cannot reach them however it is written, so
`content.js` puts a small sheet inside the shadow root and keeps it in step
with the settings.

LinkedIn's class names are hashed and rotate with every deploy, so nothing here
keys on one. The durable hooks are ARIA roles and labels (`role="listitem"`,
`section[aria-label]`), `data-testid`, and the visible label itself.

There are two desktop front ends in service at once -- a newer one with
`data-testid` and an older Ember one that still runs messaging -- so the rules
that hide the top bar and the columns name both.

That last one is why this extension has a marking pass where the YouTube one
does not. What separates a promoted post from an ordinary one is the word
"Promoted" in its header, and CSS has no text selector. So `content.js` reads
each feed item's labels, marks it `data-pbs="sponsored"`, and `hide.css` hides
the mark. The panels in the side columns are found the same way, growing from
the label outwards to the largest box that does not also contain a different
panel's label.

Because it keys on words, it is language-dependent: the switches are written
against LinkedIn in English.

### Checking it still works

LinkedIn is behind a login, so the signed-out headless audits that keep the
YouTube extension honest cannot run here. There is an audit, but it drives a
profile you sign into by hand, which is why it is not in CI:

    npm run dev:linkedin       # once, in a terminal of its own; sign in if asked
    npm run check:linkedin     # check every switch against the page it is showing
    npm run check:linkedin -- /feed/ /in/me/ /jobs/ /mynetwork/grow/
    npm run check:linkedin -- --panels /feed/       # is each panel's box the whole panel?
    npm run check:linkedin -- --collateral /feed/   # does any switch hide what is not its own?
    npm run live:linkedin -- /feed/ /mynetwork/grow/   # what each setting really takes

The profile lives in `~/.config/peacebestill/linkedin-dev-profile` and keeps
its session, so signing in is a one-off. `check:linkedin` reports, per switch, how many targets it found on the page and
how many actually stopped rendering. `--panels` reports the box each panel
resolves to and flags one that leaves an empty container behind; `--collateral`
turns each switch on alone and reports anything that stopped rendering which
that switch does not own. Between them they catch the two ways this goes wrong:
hiding too little of a panel, and hiding something else as well.

Both of those drive the marking code directly, which makes them quick but means
they only ever prove the harness agrees with itself. `live:linkedin` is the one
that settles an argument: it writes each setting through the extension's own
storage, lets the content script act, and compares the page against a baseline
taken with everything off. It prints, per setting, what actually went. Because
LinkedIn never serves the same page twice, a removal counts only once the thing
has come back without the setting and gone again with it -- one round of that
is a coin toss, which had three unrelated settings appearing to hide the same
panel.
it drives the browser over Firefox's remote debugging protocol, the channel
devtools uses, so it sets no automation flag on your session. It reads the
extension's own `core.js` and lifts the marking pass out of its `content.js`,
so what it tests is what ships.

Pages read this way are never committed, in any form — this repository is
public, and a signed-in LinkedIn page carries real names and profile
identifiers. When LinkedIn changes its markup a switch stops working silently;
the fix is to open the page again and correct the rule.

## Developing

    npm install
    npm test                 # node --test, across the shared tooling and every extension
    npm run lint             # web-ext lint
    npm run build            # both packages per extension, into dist/
    npm run bump patch       # one version across package.json and every manifest
    npm run start:firefox:youtube     # throwaway profile with that extension loaded
    npm run start:chromium:youtube
    npm run start:firefox:linkedin
    npm run start:chromium:linkedin

To try one in your real, signed-in profile: Firefox → `about:debugging` → This
Firefox → Load Temporary Add-on → `extensions/<site>/src/manifest.json`;
Chromium → `chrome://extensions` → Developer mode → Load unpacked →
`extensions/<site>/src`.

A site's markup is undocumented and changes. The audits below are the YouTube
extension's; LinkedIn has none, for the reason given above. When one of its
switches stops working, run the audits, which drive a signed-out headless browser through a live page and
report, per switch, how many targets exist and how many are still rendered
(screenshots land in `extensions/youtube/audit/out/`):

    npm run audit:chromium    # puppeteer-core against /usr/bin/chromium-browser
    npm run audit:firefox     # Marionette against /usr/bin/firefox, no driver needed
    npm run audit:mobile      # m.youtube.com, Chromium emulating a phone

`audit:mobile` covers the Firefox for Android surface, exercising only the
`ytm-*` rules and checking the desktop ones stay inert there; Chromium stands
in for Firefox because it emulates a phone with no device attached, and what is
under test is the stylesheet against the mobile DOM. On mobile the Create
button, the notifications bell and the Subscriptions pivot item are all
signed-in only, so those three are the ones to check by hand.

All three run two passes: first every child switch on with the parents off, so
each child has a visible container to act inside, then the parents as well. Turning
everything on at once tells you nothing, because a parent hides the container
its children live in. The Create button and the subscription dots only exist
signed in, so those two are checked by hand.

## Layout

```
extensions/<site>/src     the extension itself
extensions/<site>/test    its unit tests
extensions/<site>/audit   its live-page audits, where the site allows one
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
| addons.mozilla.org | the source tree | `<site>@peacebestill.fyi` | Mozilla |
| Chrome Web Store | the source tree | assigned by Google | Google |
| Self-hosted Firefox | + `update_url`s, own ID | `<site>-selfhosted@peacebestill.fyi` | the `.json` below |
| Self-hosted Chromium | + `update_url`s | derived from the CRX key | the `.xml` below |

`<site>` is `youtube` or `linkedin`; the self-hosted Firefox ID is derived from
the store one by `scripts/variant.mjs`, so it is never chosen by hand.

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
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-linkedin.xpi
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-linkedin.crx
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-linkedin-updates.json
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-linkedin-updates.xml

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
  as the privacy policy. Then put its slug in the repository variable
  `YOUTUBE_AMO_SLUG`. The AMO credentials alone cannot gate that step, since
  they are also what signs the self-hosted build; the slug is what says a
  listing exists to receive a version.
- **Chrome Web Store** — a one-off $5 developer registration, then create the
  item, and put the ID it assigns in the repository variable
  `YOUTUBE_CWS_ITEM_ID`. The listing must answer the data-use questions: the
  dislike count is the only outbound request, it is off by default, and
  `PRIVACY.md` is the policy to link.

Each extension has its own pair of variables, so each store's step is gated per
extension: `YOUTUBE_AMO_SLUG` / `YOUTUBE_CWS_ITEM_ID`, and `LINKEDIN_AMO_SLUG` /
`LINKEDIN_CWS_ITEM_ID`. The LinkedIn listings are the simpler pair to fill in:
that extension makes no network request at all, in any configuration, so every
data-use question is answered "nothing collected".

### Secrets (repository settings → Secrets and variables → Actions)

| Secret | Where it comes from |
| --- | --- |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | https://addons.mozilla.org/developers/addon/api/key/ (a free Mozilla account, and one pair signs every extension on both channels) |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` | a Google Cloud OAuth client with the Chrome Web Store API enabled, authorised once against the developer account |
| `YOUTUBE_CRX_PRIVATE_KEY` | the PEM generated below; the self-hosted Chromium ID is derived from it, so it must never change |
| `LINKEDIN_CRX_PRIVATE_KEY` | the same, for the LinkedIn extension |

And four variables, not secrets: `YOUTUBE_AMO_SLUG`, `YOUTUBE_CWS_ITEM_ID`,
`LINKEDIN_AMO_SLUG` and `LINKEDIN_CWS_ITEM_ID`. Each names a listing that
exists, and each gates one store's step for one extension, so a release before
a listing simply skips it.

    mkdir -p ~/.config/peacebestill
    openssl genrsa -out ~/.config/peacebestill/youtube-crx-key.pem 2048
    openssl genrsa -out ~/.config/peacebestill/linkedin-crx-key.pem 2048
    node scripts/pack-crx.mjs --key ~/.config/peacebestill/linkedin-crx-key.pem --id   # the Chromium ID

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
