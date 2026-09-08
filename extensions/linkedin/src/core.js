// Shared by the content script and the options page. Content scripts cannot
// be ES modules, so this is a classic script that publishes one global.
(function (root) {
  // Options-page sections, in display order. Blackout has one to itself, and
  // it comes first, because it is the parent of everything below it.
  const GROUPS = ["The whole site", "Home and feed", "Notifications"];
  const [SITE, HOME, NOTIFICATIONS] = GROUPS;

  // What the page says, and what the tab says, once the site is blacked out.
  // hide.css draws this string; a test holds the two to the same sentence.
  const BLACKOUT_TITLE = "You made the right choice.";

  // [key, label, on by default, group, parent?]. The order here is the order
  // of the data-peacebestill tokens; the options page groups by the fourth field
  // and nests by the fifth. A parent is a switch that hides the thing its
  // children live inside, so while it is on they cannot matter.
  //
  // Blackout is the parent of every other switch: it replaces the entire site,
  // so nothing else can have any effect. Nothing about that needs new logic --
  // isMoot walks the parent chain, and options.js only nests a child under its
  // parent when the two share a group, so every switch below still renders at
  // the top level of its own section.
  //
  // Every default is false: a fresh install changes nothing about LinkedIn
  // until you switch something on. That also means storage holds exactly the
  // switches you turned on, since a value equal to its default is not stored.
  const FEATURES = [
    ["blackout", "Replace LinkedIn with a better idea", false, SITE],
    ["homeToMessaging", "Open Messaging instead of the home feed", false, HOME, "blackout"],
    ["homeToNotifications", "Open Notifications instead of the home feed", false, HOME, "blackout"],
    ["homeToJobs", "Open Jobs instead of the home feed", false, HOME, "blackout"],
    ["notificationCount", "Hide the unread count in the tab title", false, NOTIFICATIONS, "blackout"],
  ];
  const KEYS = FEATURES.map(([key]) => key);

  // The home page, by every path LinkedIn serves it at, and where each switch
  // sends it. A destination is never itself a home path, so a redirect cannot
  // loop.
  const HOME_PATHS = ["/", "/feed", "/feed/"];
  const DESTINATIONS = [
    ["homeToMessaging", "/messaging/"],
    ["homeToNotifications", "/notifications/"],
    ["homeToJobs", "/jobs/"],
  ];

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

  // What the content script should actually do, given what is stored: the
  // defaults filled in, and any switch its parent has made moot forced off.
  // Everything downstream reads this and tests each key for truth, so a key
  // that is absent -- which is every key on a fresh install, since only
  // non-default values are stored -- can never be mistaken for "on".
  function effective(stored) {
    const merged = withDefaults(stored);
    for (const key of KEYS) {
      if (merged[key] && isMoot(key, merged)) merged[key] = false;
    }
    return merged;
  }

  // Where the home page should go instead, or null. Only the home page is ever
  // redirected. If more than one destination is switched on the first in
  // FEATURES order wins, so the answer is defined rather than whichever key
  // happened to be iterated first. A blacked-out site never navigates: there
  // is nothing at the other end worth loading.
  function redirectFor(pathname, settings) {
    const merged = withDefaults(settings);
    if (merged.blackout === true) return null;
    if (!HOME_PATHS.includes(pathname || "")) return null;
    for (const [key, target] of DESTINATIONS) if (merged[key] === true) return target;
    return null;
  }

  // "(3) Feed | LinkedIn" -> "Feed | LinkedIn": the unread count LinkedIn
  // prepends to the tab title.
  function untitled(title) {
    return String(title).replace(/^\(\d+\)\s+/, "");
  }

  // What the tab should say, given what it says now, or null to leave it
  // alone. Blackout replaces the page, so the tab says the same sentence
  // rather than still advertising a feed and an unread count.
  function titleFor(title, settings) {
    const merged = withDefaults(settings);
    if (merged.blackout === true) return title === BLACKOUT_TITLE ? null : BLACKOUT_TITLE;
    if (merged.notificationCount !== true) return null;
    const calm = untitled(title);
    return calm === title ? null : calm;
  }

  root.PeaceBeStill = { GROUPS, FEATURES, KEYS, BLACKOUT_TITLE, defaults, withDefaults, effective, isDefaultValue, redundantKeys, parentOf, isMoot, tokensFor, redirectFor, untitled, titleFor };
})(globalThis);
