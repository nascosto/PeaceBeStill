// Shared by the content script and the options page. Content scripts cannot
// be ES modules, so this is a classic script that publishes one global.
(function (root) {
  // Options-page sections, in display order.
  const GROUPS = ["Header and sidebar", "Home and feeds", "Watch page", "Player", "Search", "Channel pages"];
  const [HEADER, HOME, WATCH, PLAYER, SEARCH, CHANNEL] = GROUPS;

  // [key, label, on by default, group, parent?]. The order here is the order
  // of the data-peacebestill tokens; the options page groups by the fourth field
  // and nests by the fifth. A parent is a switch that hides the thing its
  // children live inside, so while it is on they cannot matter.
  //
  // Every default is false: a fresh install changes nothing about YouTube
  // until you switch something on. That also means storage holds exactly the
  // switches you turned on, since a value equal to its default is not stored.
  const FEATURES = [
    ["create", "Hide the Create button in the header", false, HEADER, "header"],
    ["moreFromYoutube", "Hide the “More from YouTube” sidebar section", false, HEADER],
    ["subscriptionDots", "Hide the new-video dot beside channels in Subscriptions", false, HEADER, "subscriptions"],
    ["expandDescription", "Open the video description automatically (and drop its Show less)", false, WATCH, "description"],
    ["descriptionChannelLinks", "Hide the channel row at the bottom of the description", false, WATCH, "description"],
    ["descriptionCards", "Hide the transcript, podcast, chapters, music and “How this was made” cards in the description", false, WATCH, "description"],
    ["descriptionChips", "Hide hashtags and link chips in the description", false, WATCH, "description"],
    ["footer", "Hide the About / Press / Copyright block under the sidebar", false, HEADER],
    ["ask", "Hide YouTube's AI “Ask” button and card", false, WATCH],
    ["summary", "Hide the AI-generated video summary", false, WATCH, "description"],
    ["upcoming", "Hide upcoming videos and their Notify me button in the Subscriptions feed", false, HOME, "subscriptions"],
    ["channelTabs", "Hide a channel's Posts and Store tabs", false, CHANNEL],
    ["channelTabRedirect", "Send a channel's Posts and Store pages to the channel home", false, CHANNEL],
    ["stalePlaceholders", "Hide the loading placeholders and spinner left behind at the end of a feed", false, HOME],
    ["titleCase", "Turn ALL-CAPS titles into sentence case", false, HOME],
    // Worth knowing before switching this one on: the count comes from the
    // Return YouTube Dislike service, which means telling a third party which
    // video you are watching.
    ["dislikeCount", "Show the dislike count (asks returnyoutubedislike.com for each video)", false, WATCH, "buttonsBar"],
    // Ported from Unhook.
    ["header", "Hide the whole top bar (logo, search, account)", false, HEADER],
    ["notifications", "Hide the notifications bell and the unread count in the tab title", false, HEADER, "header"],
    ["exploreTrending", "Hide the Explore section, Trending, and their pages", false, HEADER],
    ["subscriptions", "Hide Subscriptions (the sidebar entry, the channel list and the feed page)", false, HEADER],
    ["homeFeed", "Hide the home page feed", false, HOME],
    ["homeToSubscriptions", "Send the home page to the Subscriptions feed", false, HOME, "subscriptions"],
    ["shorts", "Hide Shorts everywhere, and open a Short as a normal video", false, HOME],
    ["mixes", "Hide Mixes (auto-generated playlists)", false, HOME],
    ["promos", "Hide promo banners, the masthead ad and surveys", false, HOME],
    ["relatedVideos", "Hide the whole column beside the video (related videos, chat, playlist)", false, WATCH],
    ["recommended", "Hide the recommended-videos list beside the video and the “More videos” overlay on pause", false, WATCH, "relatedVideos"],
    ["liveChat", "Hide live chat", false, WATCH, "relatedVideos"],
    ["playlistPanel", "Hide the playlist panel beside the video", false, WATCH, "relatedVideos"],
    ["fundraiser", "Hide the fundraiser shelf", false, WATCH],
    ["merch", "Hide merch, tickets, offers and context boxes under the video", false, WATCH],
    ["comments", "Hide comments", false, WATCH],
    ["profilePhotos", "Hide profile photos in comments", false, WATCH, "comments"],
    ["videoInfo", "Hide the views and date line under the video", false, WATCH],
    ["buttonsBar", "Hide the like / share / save row under the video", false, WATCH],
    ["channelRow", "Hide the channel row under the video", false, WATCH],
    ["description", "Hide the description", false, WATCH],
    ["autoplay", "Switch autoplay off and hide its toggle and countdown", false, PLAYER],
    ["endScreenFeed", "Hide the video wall when a video ends", false, PLAYER],
    ["endScreenCards", "Hide end-screen cards", false, PLAYER],
    ["annotations", "Hide info cards, the cards button and the channel watermark on the player", false, PLAYER],
    ["searchShelves", "Hide the shelves in search results (For you, People also watched, Latest from…)", false, SEARCH],
  ];
  const KEYS = FEATURES.map(([key]) => key);

  function defaults() {
    return Object.fromEntries(FEATURES.map(([key, , defaultOn]) => [key, defaultOn]));
  }

  // Stored settings over the defaults. Only booleans count, so a key that is
  // absent, removed (storage.onChanged reports a removal as undefined) or
  // junk falls back to its default. That is what lets us store only the
  // switches you have actually changed, and lets a later version's new
  // default reach everyone who never touched that switch.
  function withDefaults(settings) {
    const merged = defaults();
    for (const [key, value] of Object.entries(settings || {})) {
      if (typeof value === "boolean") merged[key] = value;
    }
    return merged;
  }

  // Settings -> the value of the root element's data-peacebestill attribute: the
  // enabled keys, space separated, so hide.css can gate on ~="key".
  function tokensFor(settings) {
    const merged = withDefaults(settings);
    return KEYS.filter((key) => merged[key] === true).join(" ");
  }

  // True when this value is what the feature would do anyway, so storing it
  // would be storing nothing. Unknown keys are never redundant: we do not
  // own them and must not delete them.
  function isDefaultValue(key, value) {
    const all = defaults();
    return Object.prototype.hasOwnProperty.call(all, key) && all[key] === value;
  }

  // The stored keys worth deleting: everything already equal to its default.
  function redundantKeys(stored) {
    return Object.entries(stored || {})
      .filter(([key, value]) => isDefaultValue(key, value))
      .map(([key]) => key);
  }

  // 1234 -> "1.2K", the way YouTube shows its own counts. Anything that is not
  // a non-negative finite number becomes "", so a bad API answer shows nothing.
  function formatCount(n) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "";
    if (n < 1000) return String(n);
    for (const [suffix, size] of [["B", 1e9], ["M", 1e6], ["K", 1e3]]) {
      if (n >= size) {
        const value = n / size;
        return (value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value))) + suffix;
      }
    }
    return String(n);
  }

  function videoIdFrom(search) {
    return new URLSearchParams(search).get("v");
  }

  // "I BUILT A PC IN 24 HOURS" -> "I built a pc in 24 hours". Only touches a
  // title that is shouting: at least six letters, 80 % or more of them upper
  // case. Sentence case: lower-case it all, then capitalise the start of each
  // sentence and the pronoun I. Anything that is not a string comes back as is.
  function calmTitle(text) {
    if (typeof text !== "string") return text;
    const letters = text.match(/\p{L}/gu) || [];
    if (letters.length < 6) return text;
    const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
    if (upper / letters.length < 0.8) return text;
    return text
      .toLowerCase()
      .replace(/(^|[.!?]\s+)(\p{L})/gu, (match, before, letter) => before + letter.toUpperCase())
      .replace(/\bi\b/g, "I");
  }

  // "/@MarkRober/posts" -> "/@MarkRober"; any other path -> null. Channel
  // pages come as /@handle, /channel/ID, /c/name or /user/name; the tabs this
  // covers are posts (also its old name, community) and store.
  function channelHomeFor(pathname) {
    const match = /^(\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+))\/(?:posts|community|store)\/?$/.exec(pathname || "");
    return match ? match[1] : null;
  }

  // Where a page should go instead, given the settings, or null: the home
  // page to the Subscriptions feed (never when that feed is itself hidden),
  // a Short to its ordinary watch page.
  function redirectFor(pathname, settings) {
    const merged = withDefaults(settings);
    if (merged.homeToSubscriptions && !merged.subscriptions && pathname === "/") return "/feed/subscriptions";
    const short = /^\/shorts\/([A-Za-z0-9_-]{6,})/.exec(pathname || "");
    if (merged.shorts && short) return "/watch?v=" + short[1];
    return null;
  }

  // A feed's "loading more" block (ghost cards and a spinner) should vanish
  // when the feed ends; YouTube sometimes leaves it, more often with an ad
  // blocker. Given the block's previous record, the time, the grid's item
  // count and whether the block is in view: the next record, and whether to
  // hide it. The clock only runs while it is in view, and any growth of the
  // grid restarts it, so a block that is still loading is never hidden.
  function placeholderVerdict(prev, now, items, inView, staleMs) {
    if (!prev || prev.items !== items) return { record: { since: inView ? now : null, items }, hide: false };
    if (!inView) return { record: prev, hide: false };
    if (prev.since == null) return { record: { since: now, items }, hide: false };
    return { record: prev, hide: now - prev.since >= staleMs };
  }

  // "(3) Some video - YouTube" -> "Some video - YouTube": the unread count
  // YouTube prepends to the tab title.
  function untitled(title) {
    return String(title).replace(/^\(\d+\)\s+/, "");
  }

  // The switch a feature lives inside, or null. Only one level deep today,
  // but isMoot walks the whole chain so deeper nesting would just work.
  function parentOf(key) {
    const feature = FEATURES.find(([featureKey]) => featureKey === key);
    return (feature && feature[4]) || null;
  }

  // True when some ancestor of this feature is switched on, i.e. the thing it
  // acts on is already hidden, so the feature cannot have any effect. The
  // options page greys such a switch out; its stored value is left alone, so
  // turning the parent off brings it back exactly as it was.
  function isMoot(key, settings) {
    const merged = withDefaults(settings);
    const seen = new Set();
    for (let parent = parentOf(key); parent && !seen.has(parent); parent = parentOf(parent)) {
      if (merged[parent] === true) return true;
      seen.add(parent);
    }
    return false;
  }

  root.PeaceBeStill = { GROUPS, FEATURES, KEYS, defaults, withDefaults, isDefaultValue, redundantKeys, parentOf, isMoot, tokensFor, formatCount, videoIdFrom, calmTitle, channelHomeFor, redirectFor, placeholderVerdict, untitled };
})(globalThis);
