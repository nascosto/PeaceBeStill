// Shared by the content script and the options page. Content scripts cannot
// be ES modules, so this is a classic script that publishes one global.
(function (root) {
  // Options-page sections, in display order.
  const GROUPS = ["Header and sidebar", "Home and feeds", "Watch page", "Player", "Search", "Channel pages"];
  const [HEADER, HOME, WATCH, PLAYER, SEARCH, CHANNEL] = GROUPS;

  // [key, label, on by default, group]. The order here is the order of the
  // data-yt-tidy tokens; the options page groups by the fourth field.
  const FEATURES = [
    ["create", "Hide the Create button in the header", true, HEADER],
    ["moreFromYoutube", "Hide the “More from YouTube” sidebar section", true, HEADER],
    ["subscriptionDots", "Hide the new-video dot beside channels in Subscriptions", true, HEADER],
    ["expandDescription", "Open the video description automatically (and drop its Show less)", true, WATCH],
    ["descriptionChannelLinks", "Hide the channel row at the bottom of the description", true, WATCH],
    ["descriptionCards", "Hide the transcript, podcast, chapters, music and “How this was made” cards in the description", true, WATCH],
    ["descriptionChips", "Hide hashtags and link chips in the description", true, WATCH],
    ["footer", "Hide the About / Press / Copyright block under the sidebar", true, HEADER],
    ["ask", "Hide YouTube's AI “Ask” button and card", true, WATCH],
    ["summary", "Hide the AI-generated video summary", true, WATCH],
    ["upcoming", "Hide upcoming videos and their Notify me button in the Subscriptions feed", true, HOME],
    ["channelTabs", "Hide a channel's Posts and Store tabs", true, CHANNEL],
    ["channelTabRedirect", "Send a channel's Posts and Store pages to the channel home", true, CHANNEL],
    ["stalePlaceholders", "Hide the loading placeholders and spinner left behind at the end of a feed", true, HOME],
    ["titleCase", "Turn ALL-CAPS titles into sentence case", true, HOME],
    // Off by default: the count comes from the Return YouTube Dislike service,
    // which means telling a third party which video you are watching.
    ["dislikeCount", "Show the dislike count (asks returnyoutubedislike.com for each video)", false, WATCH],
    // Ported from Unhook; defaults are the values Ben had set there.
    ["header", "Hide the whole top bar (logo, search, account)", false, HEADER],
    ["notifications", "Hide the notifications bell and the unread count in the tab title", true, HEADER],
    ["exploreTrending", "Hide the Explore section, Trending, and their pages", false, HEADER],
    ["subscriptions", "Hide Subscriptions (the sidebar entry, the channel list and the feed page)", false, HEADER],
    ["homeFeed", "Hide the home page feed", true, HOME],
    ["homeToSubscriptions", "Send the home page to the Subscriptions feed", true, HOME],
    ["shorts", "Hide Shorts everywhere, and open a Short as a normal video", true, HOME],
    ["mixes", "Hide Mixes (auto-generated playlists)", true, HOME],
    ["promos", "Hide promo banners, the masthead ad and surveys", true, HOME],
    ["relatedVideos", "Hide the whole column beside the video (related videos, chat, playlist)", true, WATCH],
    ["recommended", "Hide the recommended-videos list beside the video and the “More videos” overlay on pause", true, WATCH],
    ["liveChat", "Hide live chat", true, WATCH],
    ["playlistPanel", "Hide the playlist panel beside the video", true, WATCH],
    ["fundraiser", "Hide the fundraiser shelf", true, WATCH],
    ["merch", "Hide merch, tickets, offers and context boxes under the video", true, WATCH],
    ["comments", "Hide comments", false, WATCH],
    ["profilePhotos", "Hide profile photos in comments", false, WATCH],
    ["videoInfo", "Hide the views and date line under the video", false, WATCH],
    ["buttonsBar", "Hide the like / share / save row under the video", false, WATCH],
    ["channelRow", "Hide the channel row under the video", false, WATCH],
    ["description", "Hide the description", false, WATCH],
    ["autoplay", "Switch autoplay off and hide its toggle and countdown", true, PLAYER],
    ["endScreenFeed", "Hide the video wall when a video ends", true, PLAYER],
    ["endScreenCards", "Hide end-screen cards", true, PLAYER],
    ["annotations", "Hide info cards, the cards button and the channel watermark on the player", true, PLAYER],
    ["searchShelves", "Hide the shelves in search results (For you, People also watched, Latest from…)", true, SEARCH],
  ];
  const KEYS = FEATURES.map(([key]) => key);

  function defaults() {
    return Object.fromEntries(FEATURES.map(([key, , defaultOn]) => [key, defaultOn]));
  }

  // Settings -> the value of the root element's data-yt-tidy attribute: the
  // enabled keys, space separated, so tidy.css can gate on ~="key". A key that
  // is missing from storage takes its default, so a feature added in a later
  // version behaves the same for everyone who already installed the extension.
  function tokensFor(settings) {
    const merged = { ...defaults(), ...(settings || {}) };
    return KEYS.filter((key) => merged[key] === true).join(" ");
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
    const merged = { ...defaults(), ...(settings || {}) };
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

  root.YtTidy = { GROUPS, FEATURES, KEYS, defaults, tokensFor, formatCount, videoIdFrom, calmTitle, channelHomeFor, redirectFor, placeholderVerdict, untitled };
})(globalThis);
