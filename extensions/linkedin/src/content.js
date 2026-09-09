// Runs at document_start on linkedin.com. Keeps the root element's
// data-peacebestill attribute equal to the enabled feature keys -- hide.css does
// the hiding, and for blackout the drawing -- sends the home page elsewhere
// when asked, and keeps the tab title in step with both.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { KEYS, BLACKOUT_TITLE, tokensFor, effective, redirectFor, titleFor, kindsFor } = globalThis.PeaceBeStill;

  // What storage holds, and what that means once defaults are filled in and
  // anything blackout has made moot is forced off. Only `settings` is ever
  // read, and every read tests for truth: storage keeps only values that
  // differ from a default, so an absent key means off and must never be
  // mistaken for on.
  let stored = {};
  let settings = effective(stored);

  // The last title LinkedIn set for itself. Captured as it goes past rather
  // than once at startup, because at document_start the title has not been
  // parsed yet. Switching blackout off puts this back, so the tab stops saying
  // our sentence without waiting for the next navigation.
  let siteTitle = "";

  function apply() {
    document.documentElement.dataset.peacebestill = tokensFor(settings);
  }

  function keepTitle() {
    if (document.title && document.title !== BLACKOUT_TITLE) siteTitle = document.title;
    if (!settings.blackout && document.title === BLACKOUT_TITLE && siteTitle) document.title = siteTitle;
    const wanted = titleFor(document.title, settings);
    if (wanted !== null) document.title = wanted;
  }


  // --- Marking what CSS cannot select ---------------------------------------
  // LinkedIn tells a promoted, suggested or recommended post apart from an
  // ordinary one by a short label in its header, and CSS has no text selector.
  // So each feed item is read once, classified, and marked with data-pbs;
  // hide.css hides the marks. Items are marked once and remembered, because a
  // feed grows by hundreds of nodes as it scrolls.
  const FEED_ITEMS = '[data-testid="mainFeed"] [role="listitem"]';
  const seen = new WeakSet();

  // The short texts in an item's header, which is where the label lives. Bounded
  // so a long post with many spans cannot make this expensive.
  function labelsIn(item) {
    const out = [];
    for (const el of [...item.querySelectorAll("span,p")].slice(0, 80)) {
      if (el.children.length) continue;
      const text = (el.textContent || "").trim();
      if (text && text.length < 90) out.push(text);
    }
    return out;
  }

  function markFeedItems() {
    for (const item of document.querySelectorAll(FEED_ITEMS)) {
      if (seen.has(item)) continue;
      seen.add(item);
      const kinds = kindsFor(labelsIn(item));
      if (kinds.length) item.setAttribute("data-pbs", kinds.join(" "));
    }
  }

  // Panels that are only identifiable by a label inside them: the puzzles, the
  // news panel and the advert in the right rail, promoted job adverts, and the
  // "people you may know" and "suggested for you" panels elsewhere.
  //
  // The panel is the largest box around the label that does not also contain a
  // different panel's label. Growing to the first ancestor with siblings, which
  // is the obvious rule, marks only the heading: LinkedIn wraps a heading and
  // its body as two children of the panel.
  // How far a panel may grow from its label, per kind. One number cannot serve
  // them all: LinkedIn puts seven wrappers between "Start a post" and the
  // composer box, while an advert or an upsell is a small box near its label
  // and given the same room swallows the whole column.
  const DEPTH = { composer: 8, premium: 4 };
  const DEFAULT_DEPTH = 6;

  function growTo(el, root, foreign, kind) {
    let node = el;
    const limit = DEPTH[kind] ?? DEFAULT_DEPTH;
    for (let level = 0; level < limit; level++) {
      const parent = node.parentElement;
      if (!parent || parent === root) break;
      // Another kind of panel: the box would swallow something it should not.
      if (foreign.some((other) => parent.contains(other))) break;
      // And never swallow the feed itself.
      if (parent.querySelector('[role="listitem"]')) break;
      node = parent;
    }
    return node;
  }

  // Elements whose whole text is the label, innermost first: LinkedIn wraps
  // some headings around a span, so requiring a childless node misses them,
  // and accepting every ancestor would match half the page. Keeping only those
  // with no matching descendant gives exactly the label itself.
  function labelled(pattern) {
    const matches = [...document.querySelectorAll("span,p,h1,h2,h3,div,button")]
      .filter((el) => pattern.test((el.textContent || "").trim()));
    return matches.filter((el) => !matches.some((other) => other !== el && el.contains(other)));
  }

  function markModules() {
    const path = location.pathname;
    // What identifies each panel, and where it is allowed to be looked for.
    // "Promoted" is a job advert only on the jobs pages; in the feed it means a
    // sponsored post, which the feed-item pass already marks. The people
    // heading names a place -- "People you may know in Salt Lake City" -- so it
    // matches the opening rather than the whole string.
    const specs = [
      // A game tile is a div; "Play video" is the button on a post's video.
      ["games", () => [...document.querySelectorAll('div[aria-label^="Play "]')]
        .filter((el) => el.getAttribute("aria-label") !== "Play video")],
      ["news", () => labelled(/^(LinkedIn News|Top stories)$/)],
      ["otherAds", () => labelled(/^(Ad Options|Ad|Advertisement|Promoted by)$/)],
      // Upsells, told from the "Premium" badge a company or member carries by
      // the verb in front: "Try Premium for $0" is an advert, "GitHub, Premium"
      // is not.
      ["premium", () => labelled(/^(Try|Activate|Reactivate|Redeem|Get|Unlock)\b.*\bPremium\b/)],
      ["jobsPromoted", () => (path.startsWith("/jobs") ? labelled(/^Promoted$/) : [])],
      ["composer", () => labelled(/^Start a post$/)],
      ["pymk", () => (/^\/(in|mynetwork)\//.test(path) ? labelled(/^People you may know/) : [])],
      ["suggestions", () => (/^\/(in|mynetwork)\//.test(path)
        ? labelled(/^(Suggested|Suggestions|Follow suggestions|More profiles) for you$/) : [])],
    ];
    const found = specs.map(([kind, find]) => [kind, find()]);
    // An advert sitting inside a panel is part of that panel, so adverts do not
    // fence a panel in: without this the Premium button inside the composer
    // stopped the composer growing past its first row. A panel that swallows an
    // advert hides it too, which is the wanted result either way.
    const POROUS = new Set(["premium", "otherAds"]);
    for (const [kind, els] of found) {
      const foreign = found
        .filter(([other]) => other !== kind && !POROUS.has(other))
        .flatMap(([, e]) => e);
      for (const el of els) {
        // Each panel grows inside whichever labelled column it happens to live
        // in: "People you may know" is in the main column on the network page
        // and in the rail on a profile, and My Network puts some of its
        // headings outside both, so the container is found from the label up.
        const root = el.closest('aside[aria-label], section[aria-label], main') || document.body;
        // LinkedIn wraps a whole panel in a <section>, which is exactly the box
        // to hide when there is one; growing outwards is the fallback for the
        // right-rail modules and job cards, which have no section of their own.
        const section = el.closest("section");
        const box = (section && section !== root && root.contains(section))
          ? section
          : growTo(el, root, foreign, kind);
        if (box && box !== root && box.getAttribute("data-pbs") !== kind) box.setAttribute("data-pbs", kind);
      }
    }
  }

  // Pages that go somewhere else instead: the home page to Messaging,
  // Notifications or Jobs, when one of those switches is on.
  function redirectIfAsked() {
    const target = redirectFor(location.pathname, settings);
    if (!target) return false;
    location.replace(target);
    return true;
  }

  const MARKED = ["sponsored", "suggested", "recommended", "socialProof", "games", "news",
    "jobsPromoted", "peopleYouMayKnow", "suggestions", "composer", "premium", "otherAds"];

  // LinkedIn is a single-page app: it rewrites the title and renders the feed
  // long after load, so everything here is redone on mutation rather than once.
  // The observer runs only while a switch needs it, and its callback is
  // debounced so a busy feed cannot starve the page.
  let observer = null;
  let observeTimer = null;

  function pass() {
    keepTitle();
    if (MARKED.some((key) => settings[key])) {
      markFeedItems();
      markModules();
    }
  }

  function watchDom() {
    // Always: this is also how the title is put back when blackout goes off.
    pass();
    if (!(settings.blackout || settings.notificationCount || MARKED.some((key) => settings[key]))) {
      observer?.disconnect();
      observer = null;
      return;
    }
    if (observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(observeTimer);
      observeTimer = setTimeout(pass, 200);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function refresh() {
    if (redirectIfAsked()) return;
    apply();
    watchDom();
  }

  api.storage.sync.get(KEYS).then((values) => {
    stored = values;
  }).catch(() => {
    // Storage unavailable: fall back to the defaults, which are all off.
    stored = {};
  }).then(() => {
    settings = effective(stored);
    refresh();
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    // A removal arrives as a change with no newValue: drop the key so it falls
    // back to its default rather than reading as "off".
    for (const [key, change] of Object.entries(changes)) {
      if ("newValue" in change) stored[key] = change.newValue;
      else delete stored[key];
    }
    settings = effective(stored);
    refresh();
  });
})();
