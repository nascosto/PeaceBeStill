// Shared by the content script and the options page. Content scripts cannot
// be ES modules, so this is a classic script that publishes one global.
(function (root) {
  // [key, label, on by default]
  const FEATURES = [
    ["create", "Hide the Create button in the header", true],
    ["moreFromYoutube", "Hide the “More from YouTube” sidebar section", true],
    ["subscriptionDots", "Hide the new-video dot beside channels in Subscriptions", true],
    ["expandDescription", "Open the video description automatically", true],
    ["descriptionChannelLinks", "Hide the channel row at the bottom of the description", true],
    ["descriptionCards", "Hide the transcript, podcast, chapters, music and “How this was made” cards in the description", true],
    ["descriptionChips", "Hide hashtags and link chips in the description", true],
    ["footer", "Hide the About / Press / Copyright block under the sidebar", true],
    ["ask", "Hide YouTube's AI “Ask” button and card", true],
    ["summary", "Hide the AI-generated video summary", true],
    ["upcoming", "Hide upcoming videos and their Notify me button in the Subscriptions feed", true],
    ["channelTabs", "Hide a channel's Posts and Store tabs, and send those pages to the channel home", true],
    ["titleCase", "Turn ALL-CAPS titles into sentence case", true],
    // Off by default: the count comes from the Return YouTube Dislike service,
    // which means telling a third party which video you are watching.
    ["dislikeCount", "Show the dislike count (asks returnyoutubedislike.com for each video)", false],
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

  root.YtTidy = { FEATURES, KEYS, defaults, tokensFor, formatCount, videoIdFrom, calmTitle, channelHomeFor };
})(globalThis);
