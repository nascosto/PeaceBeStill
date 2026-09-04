# YouTube Tidy

A tiny Firefox and Chromium extension that hides the bits of desktop YouTube
you never use, opens the video description for you, calms ALL-CAPS titles, and
can show the dislike count. Every feature is a switch on the options page:

- the Create button in the header
- the "More from YouTube" sidebar section
- the new-video dot beside channels in the Subscriptions list
- the description: opened automatically with its "Show less" button dropped, and its channel row, its
  transcript / podcast / chapters / music cards, and its hashtags and link
  chips, each separately
- the About / Press / Copyright block under the sidebar
- YouTube's AI "Ask": the card in the description and the button under the video
- the AI-generated "Summary" block in the description
- ALL-CAPS video titles, rewritten in sentence case wherever they appear
- the dislike count beside the thumbs-down, **off by default**: it comes from
  the Return YouTube Dislike service, so turning it on tells that service
  which video you are watching. With it off the extension makes no network
  requests at all. Firefox treats that as an optional data-collection
  permission and asks you once when you tick the box.

Manifest V3, one codebase for both browsers, no background script, only the
`storage` permission, only on `www.youtube.com`.

## How it works

`src/content.js` keeps a `data-yt-tidy` attribute on `<html>` equal to the
enabled feature keys; `src/tidy.css` has one `display: none` rule per feature
gated on that attribute, so toggles apply to open tabs instantly. The same
script clicks the description's expand control once per watch-page navigation,
rewrites shouting titles as YouTube renders them, and, when asked, fetches the
dislike count and writes it into the dislike button. `src/tidy-core.js` holds
the feature list both the content script and the options page use.

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
run the audits, which drive a signed-out headless browser through a live watch
page and report, per switch, how many targets exist and how many are still
rendered (screenshots land in `audit/out/`):

    npm run audit:chromium    # puppeteer-core against /usr/bin/chromium-browser
    npm run audit:firefox     # Marionette against /usr/bin/firefox, no driver needed

Then inspect the element, fix the selector in `src/tidy.css` (or the title and
dislike selectors in `src/content.js`), and re-run. The Create button and the
subscription dots only exist signed in, so those two are checked by hand.

## Releasing

Releases are built by `.github/workflows/release.yml` from a version tag. The
tag must equal `v` + the version in `src/manifest.json`.

    # bump "version" in src/manifest.json and package.json, commit, then:
    git tag v1.0.1 && git push origin main v1.0.1

The workflow signs the XPI through Mozilla's self-distribution channel, packs
the CRX with the repo's fixed key, writes the two update manifests, and
attaches all four to the release under constant names, so these URLs are
always the newest version:

    https://github.com/nascosto/youtube-tidy/releases/latest/download/youtube-tidy.xpi
    https://github.com/nascosto/youtube-tidy/releases/latest/download/youtube-tidy.crx
    https://github.com/nascosto/youtube-tidy/releases/latest/download/updates.json
    https://github.com/nascosto/youtube-tidy/releases/latest/download/updates.xml

### Secrets (set once: repository settings → Secrets and variables → Actions)

| Secret | Where it comes from |
| --- | --- |
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | https://addons.mozilla.org/developers/addon/api/key/ (a free Mozilla account) |
| `CRX_PRIVATE_KEY` | the PEM generated below; the Chromium extension ID is derived from it, so it must never change |

    mkdir -p ~/.config/youtube-tidy
    openssl genrsa -out ~/.config/youtube-tidy/crx-key.pem 2048
    node scripts/pack-crx.mjs --key ~/.config/youtube-tidy/crx-key.pem --id   # the Chromium ID

Keep the PEM out of the repo (`.gitignore` already excludes `*.pem`).

## Installing on your machines

[system-setups](https://github.com/nascosto/system-setups) installs it through
Firefox's and Chromium's enterprise policies: Firefox everywhere and Chromium on
Linux fetch it from the URLs above and keep it updated. Chromium on Windows only
allows it, because Chromium there refuses to force-install anything from
outside the Web Store on an unmanaged machine: drop `youtube-tidy.crx` onto
`chrome://extensions` once and it updates itself afterwards.
