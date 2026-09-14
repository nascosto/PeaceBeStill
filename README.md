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

> Make YouTube "Be Still". Fully configurable with 45 options.

Every feature is a switch on the options page, grouped by where it acts and
nested under the switch it depends on. Turning a switch on takes away the ones
it covers -- hiding the description takes away the five for things inside it --
and their values are kept, so turning it back off brings them back as they were.

- the Create button, the whole top bar, the notifications bell and the unread
  count in the tab title
- sidebar clutter: Home, "More from YouTube", Explore and Trending,
  Subscriptions, the new-video dots beside channels, the About / Press /
  Copyright block. A hidden Subscriptions, Explore or Trending page sends you
  Home rather than showing a blank
- feeds: the home feed (or send home straight to Subscriptions -- the logo goes
  there too, and Home's own entries go), Shorts
  everywhere (a Short opens as a normal video), Mixes, promo banners and
  surveys, upcoming videos and their Notify me button, and the loading
  placeholders a feed leaves behind at its end
- the watch page: the whole column beside the video or just its
  recommendations, live chat, the playlist panel, fundraisers, merch, comments
  and their profile photos, and everything under the video -- title, channel,
  buttons, views and description -- or any of the views line, buttons row,
  channel row and description on its own
- the description: opened automatically with its "Show less" dropped, and its
  channel row, its transcript / podcast / chapters / music and "How this was
  made" cards, its hashtags and link chips, YouTube's AI "Ask" card and button,
  and the AI-generated summary
- the player: autoplay switched off with its toggle hidden, the end-screen
  video wall and cards, info cards and the channel watermark -- in YouTube
  players embedded on other sites as well as on YouTube itself
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
desktop rules match nothing there, and `hide.css` carries a second set in a
section of its own.

Seen working on a signed-out phone page (`npm run audit:mobile`): the top bar,
Home, sending home to Subscriptions, the home feed, Shorts, Mixes, promos, the
recommendations, everything under the video and each of its parts -- views
line, buttons, channel row, description -- comments, the playlist panel and
in-page ads. The redirects work the same, since they follow the address.

Written for a phone but only there signed in, so checked by hand: Create, the
notifications bell and the Subscriptions tab. Written, but with nothing to hide
on the pages the audit visits: Explore and Trending, fundraisers, offers, the
autoplay toggle and the end screen's next and previous suggestions.

The rest have no phone rule of their own. Those that need a sidebar do nothing
there, since a phone has none: "More from YouTube", the About / Press /
Copyright block and the subscription dots. The end-screen cards and info cards
share the desktop player's markup, so may well work, but have not been checked
on a phone. Live chat, upcoming videos, search shelves, profile photos in
comments, the description's own switches and sentence-casing titles are not
written for one. None of this costs anything: an unmatched selector hides
nothing, and every switch is off until you turn it on.

### How it works

`content.js` keeps a `data-peacebestill` attribute on `<html>` equal to the
enabled feature keys; `hide.css` has one `display: none` rule per feature gated
on that attribute, so toggles apply to open tabs instantly. The same script
redirects, opens the description, calms shouting titles, prunes stale feed
placeholders and, when asked, fetches the dislike count. `core.js` holds the
feature list that the content script, the options page and the audits all read.

Settings live in `storage.sync`, so they follow your Firefox or Chrome account.
Only switches that differ from their default are stored, so a profile on the
defaults stores nothing at all. Storage answers a moment after a page starts
drawing, so what was applied last time is also kept in YouTube's own
`localStorage` and put on the page before it is painted -- see
[PRIVACY.md](PRIVACY.md). That early pass hides and redirects, and never asks
the dislike service anything: a remembered switch may since have been turned
off.

The content script runs in YouTube players embedded on other sites too, where
the player switches apply; it never navigates, or remembers anything, from
inside someone else's page, and does nothing in YouTube's other frames.

## PeaceBeStill - LinkedIn

Thirty-four settings, and the first one is the blunt one.

- **Hide everything** — every page on the site becomes one
  line of ordinary text reading "You made the right choice." It is the whole
  site, with no exceptions; to use LinkedIn again you turn it off. While it is
  on, every other switch is taken off the options page, because none of them
  can matter when there is no page left to act on.
- **the pages**, one switch each: Home, My Network, Jobs, Messaging,
  Notifications and Profile. A page switch takes its place in the top bar and
  the page itself, and what is on that page sits under it — the feed and its
  posts under Home. Two exceptions. Profile takes only your own menu, since
  `/in/` is everyone's profile, so the profile panel switches stand on their
  own. And Messaging still runs LinkedIn's older front end, where only its place
  in the top bar goes for now
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

`live:linkedin` writes every setting through the extension's own storage, so it
keeps yours first -- in memory and in `~/.cache/peacebestill/` -- and puts them
back when it ends, whether it finished, was stopped at a sign-in wall, ran out
of page-load budget or gave up on a stall. Each page is loaded once and every
setting is tried on it where it stands; a load is spent only where the load is
the test -- a redirect arriving, or the home page leaving before it is drawn --
or to come back after a switch took the page away. A full run of five pages is
about fourteen loads, counting the one that opens the tab.

All three drive the browser over Firefox's remote debugging protocol, the
channel devtools uses, so they set no automation flag on your session. They
read the extension's own `settings.js` and `core.js`, and `check:linkedin`
lifts the marking pass out of its `content.js`, so what they test is what
ships.

Pages read this way are never committed, in any form — this repository is
public, and a signed-in LinkedIn page carries real names and profile
identifiers. When LinkedIn changes its markup a switch stops working silently;
the fix is to open the page again and correct the rule.

## Developing

    npm install
    npm test                 # node --test, across the shared tooling and every extension
    npm run lint             # web-ext lint
    npm run build            # each extension's store package, into dist/
    npm run sync             # copy shared/ into every extension (a test fails if one drifts)
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
extension's; LinkedIn's are described above. When a YouTube switch stops
working, run them: they drive a signed-out headless browser through a live page
and report, per switch, how many targets exist and how many are still rendered
(screenshots land in `extensions/youtube/audit/out/`). Each runs muted, and the
Firefox one switches off every other extension first, since an enterprise
policy can install a content blocker into even a throwaway profile:

    npm run audit:chromium    # puppeteer-core against /usr/bin/chromium-browser
    npm run audit:firefox     # Marionette against /usr/bin/firefox, no driver needed
    npm run audit:mobile      # m.youtube.com, Chromium emulating a phone

`audit:mobile` covers the Firefox for Android surface: the rules in
`hide.css`'s phone section, on a watch page, Home and a Mix, and checks the
desktop rules stay inert there. Chromium stands in for Firefox because it
emulates a phone with no device attached, and what is under test is the
stylesheet against the mobile DOM.

All three run in passes: every child switch on with its parents off, so each
child has a visible container to act inside; then the middle layer, with only
the switches that hold other parents off; then everything. Turning everything
on at once tells you nothing, because a parent hides the container its children
live in. The Create button, the notifications bell and the subscription dots
only exist signed in, so those are checked by hand.

## Being a good neighbour to the sites

The unit tests and CI never touch YouTube or LinkedIn. The live audits do, and
they are kept to what one person browsing would ask of a site -- small, spaced
out, and never in a burst -- through `scripts/audit-budget.mjs`:

- **One run per site at a time**, whichever checkout or session starts it. A
  second one is refused before it opens a browser.
- **A budget of page loads per site**, counted across every run in a ledger
  outside the repository (`~/.cache/peacebestill/page-loads.json`, holding
  only a site and a time per load): YouTube 30 an hour and 120 a day, LinkedIn
  20 an hour and 50 a day. A run declares its loads up front and does not start
  if they would not fit; the message says when they will.
- **A gap between loads**: 3 seconds for YouTube, 20 for LinkedIn.
- **No reload that is not the test.** A page is loaded once, and settings reach
  it the way they reach a real user's open tab. The YouTube Firefox audit loads
  the watch page once; the Chromium one reloads it once more, because early
  apply -- remembered settings on the page before storage answers -- is the
  one thing only a fresh load can show.
- **Stop at the first objection.** A sign-in wall, a security check, a consent
  page or Google's unusual-traffic page ends the run: measuring it would read
  as every switch passing, and asking again only makes it worse.

Each limit is there because a site has objected. LinkedIn signed the account
out after a few hundred loads in an hour on 2026-09-09, and Google began
answering this network's YouTube traffic with its unusual-traffic page on
2026-09-14 after a day of repeated runs from two sessions at once. Neither
came from a single run; both came from the total.

## Layout

```
extensions/<site>/src     the extension itself
extensions/<site>/test    its unit tests
extensions/<site>/audit   its live-page audits, where the site allows one
shared/                   settings, page helpers and the options page, copied into every src/
scripts/                  release tooling, shared by every extension
test/                     tests for that tooling and shared/, and the test helpers
```

## Releasing

Releases are built by `.github/workflows/release.yml` from a version tag, and
only from `main`: a tag on any other commit fails before anything is built.
Every extension in the repo shares the repo's version, and one release carries
them all, so the tag must equal `v` + the version in each `manifest.json`.

    git switch -c release-1.0.1
    npm run bump patch      # or minor, major, or an exact 1.2.3
    git commit -am "Release 1.0.1"
    # push the branch and merge it into main by pull request, then:
    git switch main && git pull
    git tag v1.0.1 && git push origin v1.0.1

`npm run bump` writes the new version to `package.json` and to every
extension's manifest at once, which is the one part of a release that reliably
goes wrong by hand; `scripts/check-version.mjs` then refuses any tag that
disagrees with them.

A tag publishes each extension as a new version of its listing on
addons.mozilla.org, through Mozilla's API (`web-ext sign --channel listed`).
Mozilla reviews and signs it, and Firefox updates everyone who installed from
AMO. Nothing is signed or hosted by this project, so a release needs no private
keys. The Chrome Web Store gets the same package once that store's listings
exist.

| Store | Package | Add-on ID | Updates come from |
| --- | --- | --- | --- |
| addons.mozilla.org | the source tree | `<site>@peacebestill.fyi` | Mozilla |
| Chrome Web Store | the source tree | assigned by Google | Google |

`<site>` is `youtube` or `linkedin`. Both stores reject a package that names its
own update service, so the source tree carries no `update_url`.

Each extension is submitted by a job of its own (`submit.yml`, which
`publish-stores.yml` uses too), so a failed submission for one does not stop the
other's. The submission does not wait for review, which can take days: the job
submits and finishes, and the version appears on the listing once it passes. A
tag whose AMO credentials or listing slugs are missing fails before anything is
submitted, rather than quietly skipping an extension, and says which setting is
missing. The GitHub release is created last, and only once every submission has
gone.

### First listing on each store, by hand

Neither store's API can create a listing: the first submission carries the
description, screenshots, category and data-use answers, and only the web UI
asks for those. Do each one once, then CI handles every version after it. Both
listings take <contact@peacebestill.fyi> as the contact address and
[PRIVACY.md](PRIVACY.md) as the privacy policy. To publish an existing tag again
-- after a failed or rejected submission, or to a listing created after the tag
-- run the **publish-stores** workflow from the Actions tab with that tag, and
choose the one extension that needs it if the other already went up: AMO takes
each version number once.

- **addons.mozilla.org** — submit `dist/peacebestill-youtube-store.zip` as a
  *listed* add-on, with <https://github.com/nascosto/PeaceBeStill/blob/main/PRIVACY.md>
  as the privacy policy. Then put its slug in the repository variable
  `YOUTUBE_AMO_SLUG` (and LinkedIn's in `LINKEDIN_AMO_SLUG`). A release will
  not run without both.
- **Chrome Web Store** — a one-off $5 developer registration, then create the
  item, and put the ID it assigns in the repository variable
  `YOUTUBE_CWS_ITEM_ID`. The listing must answer the data-use questions: the
  dislike count is the only outbound request, it is off by default, and
  `PRIVACY.md` is the policy to link.

Each extension has its own pair of variables: `YOUTUBE_AMO_SLUG` /
`YOUTUBE_CWS_ITEM_ID`, and `LINKEDIN_AMO_SLUG` / `LINKEDIN_CWS_ITEM_ID`. The LinkedIn listings are the simpler pair to fill in:
that extension makes no network request at all, in any configuration, so every
data-use question is answered "nothing collected".

### Secrets (repository settings → Secrets and variables → Actions)

| Secret | Where it comes from |
| --- | --- |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | https://addons.mozilla.org/developers/addon/api/key/ (a free Mozilla account; one pair publishes every extension) |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` | a Google Cloud OAuth client with the Chrome Web Store API enabled, authorised once against the developer account |

And four variables, not secrets: `YOUTUBE_AMO_SLUG` and `LINKEDIN_AMO_SLUG`,
which a release requires, and `YOUTUBE_CWS_ITEM_ID` and `LINKEDIN_CWS_ITEM_ID`,
which switch on the Chrome Web Store steps once those listings exist. Put them
under **Variables**: the workflow reads `vars.*`, and a value saved as a secret
is not seen at all.

## Licence and privacy

MIT, see [LICENSE](LICENSE). Nothing is collected: see [PRIVACY.md](PRIVACY.md).
To report a security issue, see [SECURITY.md](SECURITY.md) — please do it
privately rather than in an issue.

## Installing

From the stores: addons.mozilla.org for Firefox, and the Chrome Web Store for
Chromium once those listings are up.

A machine you administer can install them without asking every profile, by
enterprise policy. Firefox's `ExtensionSettings` takes the AMO listing's own
download URL, which always serves the newest reviewed version:

    https://addons.mozilla.org/firefox/downloads/latest/<slug>/latest.xpi

Chromium's `ExtensionInstallForcelist` takes the Chrome Web Store item ID.
