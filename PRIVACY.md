# Privacy

PeaceBeStill extensions collect nothing. There is no analytics, no telemetry,
no error reporting, no account, and no server belonging to this project. The
author receives no data about you, and there is nothing for anyone to sell,
lose or hand over.

## What is stored

Your switch settings, and only the ones you changed from their default, in the
browser's own `storage.sync`. That means they live in your Firefox or Chrome
profile and follow your browser account if you have sync turned on, exactly as
your bookmarks do. A profile still on the defaults stores nothing at all.

Nothing else is written anywhere, and the settings never leave your browser.

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
on its own site — `www.youtube.com` for one, `www.linkedin.com` for the other.
There are no host permissions for any other site, no `tabs`, no `history`, and
no background script. Neither extension can see any page but its own site, and
neither reads your account or your activity on it.

## Changes

Material changes to this document accompany a release, so the version you
agreed to stays readable in this repository's history.

Questions: <contact@peacebestill.fyi>, or a private report through
[SECURITY.md](SECURITY.md).
