# Privacy

PeaceBeStill extensions collect nothing. There is no analytics, no telemetry,
no error reporting, no account, and no server belonging to this project. The
author receives no data about you, and there is nothing for anyone to sell,
lose or hand over.

## What is stored

Your switch settings, and only the ones you changed from their default, in the
browser's own `storage.sync`. That means they live in your Firefox or Chrome
profile and follow your browser account if you have sync turned on, exactly as
your bookmarks do.

Each extension also keeps a short copy of what is switched on in its site's
own storage (`localStorage`), so that what you have hidden is hidden before the
page is drawn rather than flashing on screen first.

**PeaceBeStill - LinkedIn** writes two entries to `www.linkedin.com`'s storage:

- `peacebestill.tokens` — the names of the switches you have turned on, such as
  `home ads`
- `peacebestill.goes` — the page you chose to be sent to instead of the home
  page, if any

**PeaceBeStill - YouTube** writes one, to the storage of the YouTube site you
are on (`www.youtube.com`, or `m.youtube.com` on a phone):

- `peacebestill.tokens` — the names of the switches you have turned on, such as
  `shorts comments`

It writes nothing from inside a YouTube player embedded on another site. And it
never uses this copy to contact the dislike service: only your settings
themselves do that.

These entries are updated on every page of that site you load, and **removed
entirely once nothing is switched on**. They say nothing about you or your
account. But they are in the site's own storage, which the site's pages can
read, so LinkedIn or YouTube could see which of these switches you use.

Uninstalling an extension cannot reach into a site's storage to remove them. To
leave nothing behind, turn everything off (the options page's **Turn all off**)
and load a page of that site once before uninstalling, or clear the site's data
in your browser.

Nothing else is written anywhere, and none of it is sent anywhere by this
project.

## Network requests

**PeaceBeStill - LinkedIn** makes none, in any configuration. Every one of its
switches works entirely inside the page.

**PeaceBeStill - YouTube** makes none either, except **Show the dislike
count**, which is off until you turn it on.

While it is on, the watch page asks the Return YouTube Dislike API for the
count:

    https://returnyoutubedislikeapi.com/votes?videoId=<the video you are watching>

That sends the video's ID, and necessarily your IP address, to
`returnyoutubedislikeapi.com`, a third party this project has no connection
with. Their handling of it is theirs, described at
<https://returnyoutubedislike.com/privacy>. No identifier of you is attached,
because the extension holds none.

Turn the switch off and the request stops being made. Firefox treats it as an
optional data-collection permission and asks you the first time you tick the
box; Chrome has no equivalent prompt, so the switch itself is the consent.

## Permissions

Each extension asks for `storage`, to keep your settings, and a content script
on its own site — YouTube for one, `www.linkedin.com` for the other. The YouTube
one also runs inside YouTube players embedded on other sites, where it applies
the player switches and nothing else; it cannot see the page around the player.
There are no host permissions for any other site, no `tabs`, no `history`, and
no background script. Neither extension can see any page but its own site, and
neither reads your account or your activity on it.

## Changes

Material changes to this document accompany a release, so the version you
agreed to stays readable in this repository's history.

Questions: <contact@peacebestill.fyi>, or a private report through
[SECURITY.md](SECURITY.md).
