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
- the dislike count beside the thumbs-down: it comes from the Return YouTube
  Dislike service, so turning it on tells that service which video you are
  watching. It is the only switch that makes a network request, and Firefox
  treats it as an optional data-collection permission, asking you once when
  you tick the box.

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
    npm run lint             # web-ext lint (self-hosted rules)
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

    # bump "version" in package.json and every extensions/*/src/manifest.json, commit, then:
    git tag v1.0.1 && git push origin main v1.0.1

The workflow signs each XPI through Mozilla's self-distribution channel, packs
each CRX with that extension's fixed key, writes the two update manifests, and
attaches them all under constant, per-extension names, so these URLs are always
the newest version:

    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.xpi
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube.crx
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.json
    https://github.com/nascosto/PeaceBeStill/releases/latest/download/peacebestill-youtube-updates.xml

### Secrets (set once: repository settings → Secrets and variables → Actions)

| Secret | Where it comes from |
| --- | --- |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | https://addons.mozilla.org/developers/addon/api/key/ (a free Mozilla account, and one pair signs every extension) |
| `YOUTUBE_CRX_PRIVATE_KEY` | the PEM generated below; the Chromium extension ID is derived from it, so it must never change |

    mkdir -p ~/.config/peacebestill
    openssl genrsa -out ~/.config/peacebestill/youtube-crx-key.pem 2048
    node scripts/pack-crx.mjs --key ~/.config/peacebestill/youtube-crx-key.pem --id   # the Chromium ID

Each extension needs its own key, since the Chromium ID is derived from it and
two extensions cannot share an ID. Keep the PEMs out of the repo (`.gitignore`
already excludes `*.pem`).

## Installing on your machines

[system-setups](https://github.com/nascosto/system-setups) installs these
through Firefox's and Chromium's enterprise policies: Firefox everywhere and
Chromium on Linux fetch them from the URLs above and keep them updated. Chromium
on Windows only allows them, because Chromium there refuses to force-install
anything from outside the Web Store on an unmanaged machine: drop the `.crx`
onto `chrome://extensions` once and it updates itself afterwards.
