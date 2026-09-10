// Shared by the content script and the options page. Content scripts cannot
// be ES modules, so this is a classic script that publishes one global.
(function (root) {
  // Options-page sections, in display order. Blackout has one to itself, and
  // it comes first, because it is the parent of everything below it.
  const GROUPS = ["The whole site", "Pages", "Advertisements", "Elsewhere on LinkedIn"];
  const [SITE, PAGES_GROUP, ADS, ELSEWHERE] = GROUPS;

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
  const HOME_PATHS = ["/", "/feed", "/feed/"];
  // Where the home page can be sent instead, and what each choice is called.
  // "" is the default and means leave it alone.
  // Each choice names the page switch it depends on: somewhere you have hidden
  // is not somewhere to be sent, so it is neither offered nor obeyed.
  // In the order the top bar lists them, so the two read alike.
  const REDIRECTS = [
    ["", "Home", "home"],
    ["mynetwork", "My Network", "myNetwork"],
    ["jobs", "Jobs", "jobs"],
    ["messaging", "Messaging", "messaging"],
    ["notifications", "Notifications", "notifications"],
    // Last, as it is in the top bar. "/in/me/" is LinkedIn's own way of saying
    // "whoever is signed in", so this does not need to know who that is.
    ["profile", "Profile", "profile"],
  ];
  const REDIRECT_PATHS = {
    messaging: "/messaging/",
    notifications: "/notifications/",
    jobs: "/jobs/",
    mynetwork: "/mynetwork/",
    profile: "/in/me/",
  };

  // A feed item's kind, decided from the short label LinkedIn puts in its
  // header. Class names there are hashed and rotate per deploy, so the label is
  // the durable hook; CSS cannot select on text, so content.js marks the item
  // and hide.css hides the mark. Exact matches only, against leaf elements, so
  // a post that merely mentions the word is not caught by it.
  const KINDS = [
    // An advert in the feed is labelled "Promoted" or "Sponsored" on its own,
    // or names who paid: "Promoted by <company>", "Promoted \u2022 Partnership
    // with <company>". Those last two run under a real person's name and job
    // title, so the post reads as theirs until you notice the line underneath.
    //
    // The word alone is not enough to go on. "Promoted to Senior Engineer" is
    // an ordinary post somebody is pleased about, so the word only counts when
    // what follows it is a separator or "by" -- never another word.
    ["sponsored", /^(Promoted|Sponsored)$|^(?:Promoted|Sponsored)\s*(?:[\u2022\u00b7|]|by\b)/],
    ["suggested", /^Suggested(?: for you)?$/],
    // "Recommended for you", and the same thing with the kind of thing named
    // first: "Jobs recommended for you". A leading word is only allowed when
    // the phrase is complete, so a line that merely ends in "recommended" is
    // left where it is.
    ["recommended", /^recommended(?: for you)?$|^\w+ recommended for you$/i],
  ];
  // The "someone you know reacted to this" line that drags a stranger's post
  // into your feed. One line, a name and a verb, so it is matched loosely.
  const SOCIAL = /\b(?:likes|loves|celebrates|supports|finds|commented on|reposted)\b.*\bthis\b/;

  // The choices a setting offers, or null when it is an ordinary switch.
  function choicesFor(key) {
    const feature = FEATURES.find(([featureKey]) => featureKey === key);
    return (feature && feature[5]) || null;
  }

  // The choices still worth offering, given what is switched on. A page you
  // have hidden drops out of the list, and out of what the setting will do.
  function choicesOffered(key, settings) {
    const choices = choicesFor(key);
    if (!choices) return null;
    const merged = withDefaults(settings);
    return choices.filter(([, , needs]) => !needs || merged[needs] !== true);
  }

  // The choice actually in force: what you picked, unless you have since hidden
  // that page, in which case the first one still on offer. Hiding Home takes
  // "stay on Home" off the list too, so this can move you somewhere real.
  function redirectChoice(settings) {
    const merged = withDefaults(settings);
    const offered = choicesOffered("homeRedirect", merged) || [];
    if (offered.some(([value]) => value === merged.homeRedirect)) return merged.homeRedirect;
    return offered.length ? offered[0][0] : "";
  }

  // Given the short texts found inside one feed item, the kinds it counts as.
  function kindsFor(texts) {
    const kinds = [];
    for (const [kind, pattern] of KINDS) {
      if ((texts || []).some((t) => pattern.test(String(t).trim()))) kinds.push(kind);
    }
    if ((texts || []).some((t) => SOCIAL.test(String(t).trim()))) kinds.push("socialProof");
    return kinds;
  }

  // How many hidden feed items in a row mean the feed has stopped being worth
  // waiting for. Generous on purpose: a run of adverts is common, and cutting a
  // feed off early would lose whatever came after them.
  const CUTOFF_RUN = 15;

  // Where to stop the feed, or -1 to let it run.
  //
  // Hiding most of what arrives leaves the page short, so whatever the site
  // watches to decide you have reached the bottom stays in view, and it fetches
  // again. If what comes back is more of the same, that repeats for as long as
  // the tab is open, with nothing to show for it and no scrolling needed to
  // keep it going.
  //
  // The signature of that loop is a long run of hidden items with nothing kept
  // after them. A run in the middle of the feed is not it -- something was
  // worth keeping further down -- so only a run reaching the end counts.
  function cutoffAt(hidden, run = CUTOFF_RUN) {
    let streak = 0;
    for (let i = hidden.length - 1; i >= 0 && hidden[i]; i--) streak += 1;
    return streak >= run ? hidden.length - streak : -1;
  }

  // Which of the site's destinations a path belongs to, or "". Hiding a
  // destination hides its page as well as its place in the top bar, and CSS
  // cannot read a URL, so content.js puts this on the root element.
  //
  // Profile is deliberately absent: its switch hides your own menu in the top
  // bar, and /in/ is where everyone else's profile lives too. Blocking that
  // would stop you looking anybody up, which is not what the switch says.
  const PAGES = [
    ["home", /^\/$|^\/feed(\/|$)/],
    ["myNetwork", /^\/mynetwork(\/|$)/],
    ["jobs", /^\/jobs(\/|$)/],
    ["messaging", /^\/messaging(\/|$)/],
    ["notifications", /^\/notifications(\/|$)/],
  ];

  function pageFor(pathname) {
    for (const [key, pattern] of PAGES) if (pattern.test(pathname || "")) return key;
    return "";
  }

  const FEATURES = [
    ["blackout", "Hide everything", false, SITE],
    // The site's destinations. Each hides its page as well as its place in the
    // top bar, which is why the things belonging to a page sit under it.
    ["home", "Hide Home", false, PAGES_GROUP, "blackout"],
    ["feed", "Hide feed", false, PAGES_GROUP, "home"],
    ["composer", "Hide “Start a post” box", false, PAGES_GROUP, "feed"],
    ["suggested", "Hide suggested posts", false, PAGES_GROUP, "feed"],
    ["recommended", "Hide “Recommended for you” posts", false, PAGES_GROUP, "feed"],
    ["socialProof", "Hide posts someone in your network liked or commented on", false, PAGES_GROUP, "feed"],
    ["homeGames", "Hide puzzles and games", false, PAGES_GROUP, "home"],
    ["news", "Hide LinkedIn News panel", false, PAGES_GROUP, "home"],
    ["myNetwork", "Hide My Network", false, PAGES_GROUP, "blackout"],
    ["networkPeople", "Hide “People you may know”", false, PAGES_GROUP, "myNetwork"],
    ["networkSuggestions", "Hide suggestion panels", false, PAGES_GROUP, "myNetwork"],
    ["networkGames", "Hide puzzles and games", false, PAGES_GROUP, "myNetwork"],
    ["networkPremium", "Hide Premium adverts and upsells", false, PAGES_GROUP, "myNetwork"],
    ["jobs", "Hide Jobs", false, PAGES_GROUP, "blackout"],
    ["jobsSuggestions", "Hide “More jobs for you”", false, PAGES_GROUP, "jobs"],
    ["messaging", "Hide Messaging", false, PAGES_GROUP, "blackout"],
    ["notifications", "Hide Notifications", false, PAGES_GROUP, "blackout"],
    ["profile", "Hide Profile", false, PAGES_GROUP, "blackout"],
    ["profilePeople", "Hide “People you may know”", false, PAGES_GROUP, "profile"],
    ["profileSuggestions", "Hide suggestion panels on profiles", false, PAGES_GROUP, "profile"],
    // Not under Home: with Home gone, being sent somewhere else is more useful,
    // not less. The one setting that is not a switch.
    ["homeRedirect", "Default page", "", PAGES_GROUP, "blackout", REDIRECTS],
    // One switch for every advert on the site, with the individual kinds under
    // it. Adverts turn up in the feed, beside it, on the jobs pages and in the
    // top bar, so grouping them by page would have missed most of them.
    ["ads", "Hide all advertisements", false, ADS, "blackout"],
    ["sponsored", "Hide advertisements in feed (promoted and sponsored posts)", false, ADS, "ads"],
    ["otherAds", "Hide advertisements outside feed", false, ADS, "ads"],
    ["premium", "Hide Premium adverts and upsells", false, ADS, "ads"],
    ["jobsPromoted", "Hide promoted job adverts", false, ADS, "ads"],
    ["games", "Hide puzzles and games", false, ELSEWHERE, "blackout"],
    ["forBusiness", "Hide business features", false, ELSEWHERE, "blackout"],
    ["siteFooter", "Hide the site footer", false, ELSEWHERE, "blackout"],
    ["aiAssistant", "Hide LinkedIn's AI assistant panel", false, ELSEWHERE, "blackout"],
    // Neither of these belongs to the page it is named after: the chat bubble
    // is pinned to every page, and LinkedIn puts the unread count in the tab
    // title whether or not you have hidden Notifications.
    ["messagingOverlay", "Hide messaging overlay", false, ELSEWHERE, "blackout"],
    ["notificationCount", "Hide unread count in tab title", false, ELSEWHERE, "blackout"],
  ];

  const KEYS = FEATURES.map(([key]) => key);

  // Settings that also appear in a second place, because they belong to two
  // things at once: an advert in the feed is both an advert and part of the
  // feed. [key, the group it also appears in, the switch it sits under there].
  // The second row is the same setting, not a copy of it.
  // A switch that does something everywhere, and the per-page switches doing
  // the same thing in one place each. They sit under their own page rather than
  // under the global one, so the nesting alone cannot say the global covers
  // them -- but it does, and the options page shows them ticked and locked
  // while it is on rather than pretending they are still yours to set.
  const COVERS = [
    ["games", ["homeGames", "networkGames"]],
    // "People who viewed your profile" is a Premium panel, and it is on My
    // Network as well as on a profile.
    ["premium", ["networkPremium"]],
  ];

  function coverOf(key) {
    for (const [global, covered] of COVERS) if (covered.includes(key)) return global;
    return null;
  }

  // The global doing this switch's job for it, or null. Kept apart from
  // isMoot: a switch whose page has gone is not worth showing at all, while one
  // covered by a global is worth showing as the settled fact it is.
  function coveredBy(key, settings) {
    const global = coverOf(key);
    if (!global) return null;
    const merged = withDefaults(settings);
    // On itself, or with something above it already doing its job: hiding every
    // advert covers the Premium ones, and so covers the per-page switch too.
    return merged[global] === true || isMoot(global, merged) ? global : null;
  }

  const MIRRORS = [
    ["sponsored", PAGES_GROUP, "feed"],
  ];

  // The home page, by every path LinkedIn serves it at, and where each switch
  // sends it. A destination is never itself a home path, so a redirect cannot
  // loop.
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
      const choices = choicesFor(key);
      // A chooser takes one of its own values and nothing else; a switch takes
      // a boolean and nothing else. Anything else falls back to the default.
      if (choices) { if (choices.some(([choice]) => choice === value)) merged[key] = value; }
      else if (typeof value === "boolean") merged[key] = value;
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
    return blockerOf(key, settings) !== null;
  }

  // The nearest ancestor of this feature that is switched on: the switch that
  // actually made it moot, which the options page names. With more than one
  // level of nesting the direct parent may itself be off -- hiding the feed
  // makes the post kinds moot, but so does blacking out the whole site -- and
  // naming a switch that is off would be a lie.
  function blockerOf(key, settings) {
    const merged = withDefaults(settings);
    const seen = new Set();
    for (let parent = parentOf(key); parent && !seen.has(parent); parent = parentOf(parent)) {
      if (merged[parent] === true) return parent;
      seen.add(parent);
    }
    return null;
  }

  // What the content script should actually do, given what is stored: the
  // defaults filled in, and any switch its parent has made moot forced off.
  // Everything downstream reads this and tests each key for truth, so a key
  // that is absent -- which is every key on a fresh install, since only
  // non-default values are stored -- can never be mistaken for "on".
  function effective(stored) {
    const merged = withDefaults(stored);
    const all = defaults();
    for (const key of KEYS) {
      // Back to its own default, which is false for a switch and "" for the
      // chooser -- not false for both, which would be a value it cannot hold.
      if (merged[key] && isMoot(key, merged)) merged[key] = all[key];
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
    return REDIRECT_PATHS[redirectChoice(merged)] || null;
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

  root.PeaceBeStill = { GROUPS, FEATURES, KEYS, MIRRORS, BLACKOUT_TITLE, KINDS, SOCIAL, CUTOFF_RUN, cutoffAt, COVERS, coverOf, coveredBy, kindsFor, pageFor, defaults, withDefaults, effective, isDefaultValue, redundantKeys, parentOf, isMoot, blockerOf, choicesFor, choicesOffered, redirectChoice, tokensFor, redirectFor, untitled, titleFor };
})(globalThis);
