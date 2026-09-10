// Runs at document_start on linkedin.com. Keeps the root element's
// data-peacebestill attribute equal to the enabled feature keys -- hide.css does
// the hiding, and for blackout the drawing -- sends the home page elsewhere
// when asked, and keeps the tab title in step with both.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { KEYS, BLACKOUT_TITLE, tokensFor, effective, redirectFor, titleFor, kindsFor, pageFor, cutoffAt } = globalThis.PeaceBeStill;

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

  // LinkedIn renders its overlays -- the chat bubble, the assistant -- inside a
  // shadow root on div#interop-outlet, and a content script's stylesheet does
  // not cross that boundary. hide.css cannot reach them however it is written,
  // which is why hiding the bubble appeared to do nothing at all. So a small
  // sheet is put inside the shadow root and kept in step with the settings.
  const SHADOW_RULES = [
    ["messagingOverlay", "aside#msg-overlay, aside[class*='msg-overlay'], [class*='msg-overlay-list-bubble']"],
    ["aiAssistant", "aside#coach-container, aside[aria-label^='AI-powered assistant']"],
  ];

  function styleShadow() {
    const host = document.getElementById("interop-outlet");
    const shadow = host && host.shadowRoot;
    if (!shadow) return;
    let sheet = shadow.querySelector("style[data-peacebestill]");
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.setAttribute("data-peacebestill", "");
      shadow.appendChild(sheet);
    }
    const css = SHADOW_RULES
      .filter(([key]) => settings[key])
      .map(([, selector]) => selector + " { display: none !important; }")
      .join("\n");
    if (sheet.textContent !== css) sheet.textContent = css;
  }

  // A rule between rows is only wanted when something renders on both sides of
  // it. Marks cannot settle that on their own -- which rows are hidden depends
  // on which switches are on -- so it is decided from what the page is showing,
  // and only in lists this extension has marked something in, so a list it has
  // not touched keeps whatever rules LinkedIn drew.
  function tidyRules() {
    for (const rule of document.querySelectorAll("hr")) {
      const parent = rule.parentElement;
      if (!parent || !parent.querySelector("[data-pbs]")) continue;
      const kin = [...parent.children];
      const at = kin.indexOf(rule);
      const renders = (el) => !!el && (el.getClientRects().length > 0
        || [...el.querySelectorAll("*")].slice(0, 40).some((e) => e.getClientRects().length > 0));
      const before = kin.slice(0, at).reverse().find((el) => el.tagName !== "HR");
      const after = kin.slice(at + 1).find((el) => el.tagName !== "HR");
      // A rule at the head or foot of a list has nothing on one side of it by
      // nature, and LinkedIn drew it there on purpose, so it is judged by the
      // side it does have. Judging it by both hid it for good, even with
      // everything switched off.
      const sides = [before, after].filter(Boolean);
      const wanted = sides.length && sides.every(renders) ? "" : "none";
      if (rule.style.display !== wanted) rule.style.display = wanted;
    }
  }

  // Where the last-applied tokens are kept. storage.sync answers a moment
  // after the page starts drawing, so on the first paint nothing would be
  // hidden yet. This is read at once instead, and whatever storage says a
  // moment later replaces it.
  const REMEMBERED = "peacebestill.tokens";

  function remember(tokens) {
    try {
      globalThis.localStorage.setItem(REMEMBERED, tokens);
    } catch {
      // Site storage can be blocked. The page simply draws before we answer.
    }
  }

  function apply() {
    const tokens = tokensFor(settings);
    remember(tokens);
    document.documentElement.dataset.peacebestill = tokens;
    // Which destination this page belongs to, so the stylesheet can take the
    // page away as well as its place in the top bar.
    document.documentElement.dataset.pbsPage = pageFor(location.pathname);
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
  // How many times an item has been asked what it is. LinkedIn puts a list item
  // on the page before it fills it in, so deciding once -- the first time it is
  // seen, while it is still empty -- left it unmarked for good. Once it has an
  // answer that answer is kept; until then it is asked again a few times, and
  // then let be, so an ordinary post is not re-read on every mutation forever.
  const seen = new WeakMap();
  const TRIES = 5;

  // The short texts in an item's header, which is where the label lives. Bounded
  // so a long post with many spans cannot make this expensive.
  function labelsIn(item) {
    const out = [];
    for (const el of [...item.querySelectorAll("span,p")].slice(0, 80)) {
      // A label is not always a leaf. "<name> likes this" is one span holding a
      // link, a spacer and a bare piece of text, so reading only childless
      // elements found the name and the space but never the sentence -- which
      // is why this only ever matched posts written by hand for a test. A few
      // children are read whole; more than that starts on the body of the post.
      if (el.children.length > 3) continue;
      const text = (el.textContent || "").trim();
      if (text && text.length < 90) out.push(text);
      // And what the element says on its own, without its children. "Promoted
      // by" and "likes this" are bare text sitting beside a link holding a
      // name, so reading only the pair together makes the label depend on how
      // long that name happens to be.
      const own = [...(el.childNodes || [])]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent || "")
        .join(" ")
        .trim();
      if (own && own !== text && own.length < 90) out.push(own);
    }
    return out;
  }

  function markFeedItems() {
    for (const item of document.querySelectorAll(FEED_ITEMS)) {
      const asked = seen.get(item) || 0;
      if (asked >= TRIES) continue;
      const kinds = kindsFor(labelsIn(item));
      if (kinds.length) {
        item.setAttribute("data-pbs", kinds.join(" "));
        seen.set(item, TRIES);
      } else {
        seen.set(item, asked + 1);
      }
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
  // Panels that no switch owns, but that a switch must not swallow either.
  // Every other guard needs a landmark -- another marker, a heading element, a
  // list -- and LinkedIn's cards often have none: "Manage my network" is a
  // plain div, so the advert beside it grew straight through. Naming them is
  // less clever than a rule, and it is the thing that actually holds.
  const NEIGHBOURS = /^(Manage my network|No pending invitations|Profile viewers|Saved items|Who's viewed your profile|Recent|Connections|Followers)$/;

  // Things no panel may swallow: another page's place in the top bar, or a
  // post in the feed.
  // Things a panel must never take with it. The footer is the whole site's, not
  // any panel's: an advert in the rail sits above it, and a box that grew one
  // step too far took About, Help Center and the copyright line with it.
  const KEEP_OUT = '[data-testid="primary-nav"] li, [data-testid="mainFeed"] [role="listitem"], footer';

  // A box this tall is a panel in its own right, not a label pointing at one.
  const PANEL_SIZE = 100;
  const DEPTH = { composer: 8, premium: 6 };
  const DEFAULT_DEPTH = 6;

  const headings = (el) => el.querySelectorAll("h1,h2,h3").length;

  // An element with no box of its own. Hiding one hides nothing, because there
  // was never anything of it to see.
  function drawsNothing(el) {
    try {
      return getComputedStyle(el).display === "contents";
    } catch {
      return false;
    }
  }

  function growTo(el, root, foreign, kind) {
    let node = el;
    // The last thing on the way up that actually draws. A box may pass through
    // a wrapper set to display:contents but must never come to rest on one:
    // it has no size of its own, so every guard below measures it as nothing
    // and none of them can stop it -- while hiding it still takes everything
    // inside it away, which is how switching off adverts took the site footer.
    let box = el;
    const limit = DEPTH[kind] ?? DEFAULT_DEPTH;
    for (let level = 0; level < limit; ) {
      const parent = node.parentElement;
      if (!parent || parent === root) break;
      // A wrapper set to display:contents draws nothing of its own: it is a
      // join in the markup, not a level of the panel. Counting those spent the
      // whole budget before the box reached the card it was inside, so the
      // puzzles disappeared and the empty card they sat in did not.
      if (!drawsNothing(parent)) level += 1;
      // Another kind of panel: the box would swallow something it should not.
      if (foreign.some((other) => parent.contains(other))) break;
      // Never absorb an item that belongs to something else. "Try Premium for
      // $0" sits beside the navigation list rather than in it, so growing one
      // step from it took the whole bar -- "For Business" included -- and the
      // list guard above never saw a list to stop at.
      const strays = [...parent.querySelectorAll(KEEP_OUT)].filter((e) => !node.contains(e));
      if (strays.length) break;
      // A panel has one heading. Picking up the first is how a box grows from
      // its label to the whole panel; picking up a second means it has left
      // that panel and started on the next -- which is how hiding the advert
      // on My Network was taking "Manage my network" with it.
      if (headings(node) >= 1 && headings(parent) > headings(node)) break;
      // A list item is its own thing. Growing out of one into the list takes
      // its neighbours with it -- which is how hiding Premium adverts was
      // hiding the "For Business" menu sitting beside one in the top bar.
      if (/^(UL|OL|NAV)$/.test(parent.tagName)) break;
      // And a panel is never most of the column it sits in. The rules above
      // depend on finding a landmark -- another label, a second heading, a
      // list -- and a column of plain divs offers none, which is how hiding
      // the advert on My Network was taking the whole sidebar, "Manage my
      // network" and all, since that heading is not a heading element.
      const roomy = root.getBoundingClientRect().height;
      const parentHeight = parent.getBoundingClientRect().height;
      if (roomy > 0 && parentHeight > roomy * 0.6) break;
      // A label is small and has to grow to reach its panel; a box that is
      // already the size of a panel has arrived. So a large jump is allowed
      // while the box is still label-sized, and refused once it is not --
      // which is where the advert on My Network stopped being the advert and
      // started being "Manage my network" as well.
      // The same measure as "already a panel" above, rather than a smaller one:
      // a heading block can be 69px tall, and calling that panel-sized stopped
      // "More jobs for you" at its own heading. What keeps a label from running
      // away is the neighbours it must not swallow, not its own size.
      const nodeHeight = node.getBoundingClientRect().height;
      if (nodeHeight >= PANEL_SIZE && parentHeight > nodeHeight * 2.5) break;
      node = parent;
      if (!drawsNothing(node)) box = node;
    }
    return box;
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
      // A game tile is a div; "Play video" is the button on a post's video. The
      // invitation to a puzzle is text rather than a tile, and opens with an
      // emoji, so the leading punctuation is skipped -- and the apostrophe is
      // the typographic one, which is not the one on a keyboard.
      ["games", () => [...document.querySelectorAll('div[aria-label^="Play "]')]
        .filter((el) => el.getAttribute("aria-label") !== "Play video")
        .concat(labelled(/^\W*You[’']ve been selected to join/))
        .concat(labelled(/^Today[’']s puzzles$/))],
      ["news", () => labelled(/^(LinkedIn News|Top stories)$/)],
      ["otherAds", () => labelled(/^(Ad Options|Ad|Advertisement|Promoted by)$/)],
      // Upsells, told from the "Premium" badge a company or member carries by
      // the verb in front: "Try Premium for $0" is an advert, "GitHub, Premium"
      // is not.
      // "Who your viewers also viewed" is a Premium feature dressed as a panel.
      ["premium", () => labelled(/^(Try|Activate|Reactivate|Redeem|Get|Unlock)\b.*\bPremium\b/)
        .concat(labelled(/^Who your viewers also viewed$/))],
      ["jobsPromoted", () => (path.startsWith("/jobs") ? labelled(/^Promoted$/) : [])],
      ["composer", () => labelled(/^Start a post$/)],
      // Putting work up is a thing businesses do, so it answers to the same
      // switch as the rest of them rather than to the page it happens to be on.
      ["forBusiness", () => labelled(/^Post a free job$/)],
      // "People you may know" is on profiles as well as on My Network, and each
      // belongs to its page. The heading names the place -- "People you may
      // know in Salt Lake City" -- so it matches the opening.
      ["networkPeople", () => (path.startsWith("/mynetwork") ? labelled(/^People you may know/) : [])],
      ["profilePeople", () => (path.startsWith("/in/") ? labelled(/^People you may know/) : [])],
      // Three panels wearing similar names, and three different features: what
      // a profile suggests, what My Network suggests, and what Jobs suggests.
      // Each is scoped to the page it belongs to, and a post in the feed headed
      // "Suggested for you" is a post, which the feed pass already deals with.
      ["profileSuggestions", () => (path.startsWith("/in/")
        ? labelled(/^(Suggested for you|Pages for you|You might like|More profiles for you)$/) : [])],
      // "People skilled in Java also follow these people" names a skill, so it
      // matches the opening rather than the whole string.
      ["networkSuggestions", () => (path.startsWith("/mynetwork")
        ? labelled(/^(Suggestions for you|Follow suggestions for you)$/)
          .concat(labelled(/^People skilled in .+ also follow/)) : [])],
      ["jobsSuggestions", () => (path.startsWith("/jobs")
        ? labelled(/^More jobs for you$/) : [])],
    ];
    const found = specs.map(([kind, find]) => [kind, find()]);
    // Treated as another panel's label by every kind, so no box grows past one.
    const neighbours = labelled(NEIGHBOURS);
    // An advert sitting inside a panel is part of that panel, so adverts do not
    // fence a panel in: without this the Premium button inside the composer
    // stopped the composer growing past its first row. A panel that swallows an
    // advert hides it too, which is the wanted result either way.
    // An advert sitting inside a panel is part of that panel, so adverts do not
    // fence a panel in: the promoted jobs are inside "More jobs for you", and
    // treating them as a foreign panel left that section as a heading with the
    // jobs still under it. But one advert does not grow through another -- a
    // Premium upsell on the jobs page did exactly that and took a job listing
    // with it -- so this holds only for a panel that is not itself an advert.
    const ADVERTS = new Set(["premium", "otherAds", "jobsPromoted", "sponsored"]);
    for (const [kind, els] of found) {
      const porous = ADVERTS.has(kind) ? new Set() : ADVERTS;
      const foreign = found
        .filter(([other]) => other !== kind && !porous.has(other))
        .flatMap(([, e]) => e)
        .concat(neighbours);
      for (const el of els) {
        // Each panel grows inside whichever labelled column it happens to live
        // in: "People you may know" is in the main column on the network page
        // and in the rail on a profile, and My Network puts some of its
        // headings outside both, so the container is found from the label up.
        const root = el.closest('aside[aria-label], section[aria-label], main') || document.body;
        // "Ad Options" is the heading of the advert's own menu, which lives in
        // a <dialog> that stays closed until you click it. Growing from inside
        // that marks the menu and leaves the advert itself on the page, so step
        // out of the dialog before growing.
        const from = el.closest("dialog") ? el.closest("dialog").parentElement : el;
        if (!from) continue;
        // LinkedIn wraps a whole panel in a <section>, which is exactly the
        // box to hide -- but it nests them: the "People who viewed your
        // profile" panel is a section, and the carousel inside it is another.
        // The panel is the outermost one that still passes the tests growing
        // does, so a label may reach out to its panel while a box that is
        // already panel-sized cannot jump into a bigger one.
        const fromHeight = from.getBoundingClientRect().height;
        const room = root.getBoundingClientRect().height;
        // A <section> is LinkedIn's own boundary, so it is trusted further than
        // a box grown through anonymous divs: a real panel can be most of a
        // short column -- "Suggestions for you" is 1206px of a 1658px one --
        // and refusing it there left the heading hiding alone.
        // What a box must not swallow, whichever rule picked it.
        const holds = (candidate) => {
          if (foreign.some((other) => candidate.contains(other))) return true;
          if (neighbours.some((other) => candidate.contains(other))) return true;
          return [...candidate.querySelectorAll(KEEP_OUT)].some((e) => !from.contains(e));
        };
        // A <section> carrying a label of its own is LinkedIn saying "this is
        // a panel". It is also where growing has to stop, and being the
        // boundary meant it could never be the box: "More jobs for you" hid
        // its own heading and left every job under it, and so did the
        // suggestions on My Network.
        // But a page wraps everything in one of those too: the jobs feed sits
        // inside <section aria-label="Primary content">, and taking that for a
        // panel would hide the entire page to be rid of one heading. A panel
        // has a single heading; a page has one per panel.
        const panel = root.tagName === "SECTION" && headings(root) <= 1 && !holds(root) ? root : null;
        const fits = (candidate) => {
          if (foreign.some((other) => candidate.contains(other))) return false;
          // Asked here rather than only of the winner, so that a section
          // holding someone else's card is passed over for a smaller one
          // inside it instead of leaving the label to hide on its own.
          if (neighbours.some((other) => candidate.contains(other))) return false;
          // The same things growing refuses to swallow, refused here too: a
          // section is trusted, but not far enough to take the site's footer.
          if ([...candidate.querySelectorAll(KEEP_OUT)].some((e) => !from.contains(e))) return false;
          const height = candidate.getBoundingClientRect().height;
          // A panel really can be nearly all of a short column: the suggestions
          // on My Network are two dozen people, and refusing them at 85% left
          // the heading hidden with all the people still under it. What a
          // section must not be is the column itself.
          return room === 0 || height <= room * 0.95;
        };
        const sections = [];
        for (let node = from; node && node !== root; node = node.parentElement) {
          if (node.tagName === "SECTION") sections.unshift(node);
        }
        // A marker that is already the size of a panel is the panel: the advert,
        // once stepped out of its menu, is the whole advert, and growing it any
        // further only picks up whatever card sits next to it. A label is small
        // and has to reach out to find the panel it names.
        const chosen = fromHeight >= PANEL_SIZE
          ? from
          : (panel || sections.find(fits) || growTo(from, root, foreign, kind));
        // Whichever rule picked it, a box holding a neighbouring panel is the
        // wrong box. Better to hide nothing than to hide someone else's card.
        const box = neighbours.some((other) => chosen.contains(other)) ? null : chosen;
        if (box && box !== root && box.getAttribute("data-pbs") !== kind) box.setAttribute("data-pbs", kind);
      }
    }
    // LinkedIn rules off its lists with <hr> between the items rather than a
    // border on each, so hiding an item leaves its line behind and the list
    // ends up a run of rules with nothing between them. Each item takes the
    // rule that follows it.
    for (const marked of [...document.querySelectorAll("[data-pbs]")]) {
      const kind = marked.getAttribute("data-pbs");
      for (let node = marked; node && node !== document.body; node = node.parentElement) {
        const after = node.nextElementSibling;
        if (!after || after.tagName !== "HR") continue;
        if (!after.hasAttribute("data-pbs")) after.setAttribute("data-pbs", kind);
        break;
      }
    }

    // A rule at either end of a list has no row after it to belong to, so it
    // is left behind as a bare line once its neighbour goes. It belongs to the
    // row on the side it does have.
    for (const rule of [...document.querySelectorAll("hr")]) {
      if (rule.hasAttribute("data-pbs") || !rule.parentElement) continue;
      const kin = [...rule.parentElement.children];
      const at = kin.indexOf(rule);
      const before = kin.slice(0, at).reverse().find((el) => el.tagName !== "HR");
      const after = kin.slice(at + 1).find((el) => el.tagName !== "HR");
      const lonely = !before ? after : !after ? before : null;
      const kind = lonely && (lonely.getAttribute("data-pbs")
        || (lonely.firstElementChild && lonely.firstElementChild.getAttribute("data-pbs")));
      if (kind) rule.setAttribute("data-pbs", kind);
    }

    // Two labels of one kind inside one panel -- "Unlock Premium tools" and the
    // "Try Premium" link beside it -- each mark a box, one inside the other.
    // The outer box is the panel; drop the inner one. Done afterwards, because
    // which gets marked first depends on document order.
    for (const marked of [...document.querySelectorAll("[data-pbs]")]) {
      const kind = marked.getAttribute("data-pbs");
      if (marked.parentElement && marked.parentElement.closest('[data-pbs~="' + kind + '"]')) {
        marked.removeAttribute("data-pbs");
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
    "homeGames", "networkGames", "networkPremium", "forBusiness",
    "jobsPromoted", "networkPeople", "profilePeople", "profileSuggestions", "networkSuggestions",
    "jobsSuggestions", "composer", "premium", "otherAds", "ads"];

  // LinkedIn is a single-page app: it rewrites the title and renders the feed
  // long after load, so everything here is redone on mutation rather than once.
  // The observer runs only while a switch needs it, and its callback is
  // debounced so a busy feed cannot starve the page.
  let observer = null;
  let observeTimer = null;

  const FEED = '[data-testid="mainFeed"]';

  // Stop the feed once it is only bringing more of what is being hidden.
  //
  // Hidden items take up no room, so the page stays short, so whatever the site
  // keeps at the bottom to notice you have got there never leaves the screen.
  // It fetches, we hide what arrives, and it fetches again -- for as long as
  // the tab is open, without anyone scrolling. Cutting the feed off hides that
  // last part along with the rest, and something with no box is never in view,
  // so the fetching stops.
  function capFeed() {
    const feed = document.querySelector(FEED);
    if (!feed) return;
    // Lifted before measuring: a cut hides the very items it was decided from,
    // so left in place it would always agree with itself and never come back.
    for (const el of feed.querySelectorAll("[data-pbs-cutoff]")) el.removeAttribute("data-pbs-cutoff");
    if (!MARKED.some((key) => settings[key])) return;

    const items = [...feed.querySelectorAll('[role="listitem"]')]
      .filter((el) => !el.parentElement || !el.parentElement.closest('[role="listitem"]'));
    const at = cutoffAt(items.map((el) => el.getClientRects().length === 0));
    if (at < 0) return;

    // Everything from there on, counted in what the feed itself holds, so that
    // whatever fetches the next lot goes with it rather than being looked for.
    let node = items[at];
    while (node.parentElement && node.parentElement !== feed) node = node.parentElement;
    if (!node.parentElement) return;
    for (let el = node; el; el = el.nextElementSibling) el.setAttribute("data-pbs-cutoff", "");
  }

  function pass() {
    keepTitle();
    styleShadow();
    if (MARKED.some((key) => settings[key])) {
      markFeedItems();
      markModules();
      tidyRules();
    }
    capFeed();
  }

  function watchDom() {
    // Always: this is also how the title is put back when blackout goes off.
    pass();
    const overlayOn = SHADOW_RULES.some(([key]) => settings[key]);
    if (!(settings.blackout || settings.notificationCount || overlayOn || MARKED.some((key) => settings[key]))) {
      observer?.disconnect();
      observer = null;
      return;
    }
    if (observer) return;
    observer = new MutationObserver(() => {
      // Run in the observer's own turn. The browser has not painted yet when
      // this happens, so what is hidden here is never seen at all. Waiting even
      // a fifth of a second means the thing appears and then vanishes, which
      // reads worse than leaving it alone would.
      pass();
      // And again once things have settled, for whatever arrives after the
      // element that holds it -- a panel's height, a post's label.
      clearTimeout(observeTimer);
      observeTimer = setTimeout(pass, 200);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  // LinkedIn is a single-page app: clicking the logo or the top bar changes the
  // URL without a load, and nothing above re-reads it. Left alone, a page taken
  // out of the top bar is still reachable by clicking through to it, and every
  // rule keeps applying to whichever page happened to load first. Polling the
  // path is cheaper than watching the whole document for it, and it cannot be
  // outrun by a router that changes the URL before the DOM.
  let seenPath = location.pathname;
  let pathTimer = null;

  function watchPath() {
    // Nothing switched on means nothing to keep up to date. Asking what the
    // home page would do is how we tell a redirect is set: it is the only page
    // that has one, and we are not necessarily standing on it.
    const busy = tokensFor(settings) !== "" || redirectFor("/feed/", settings) !== null;
    if (!busy) {
      clearInterval(pathTimer);
      pathTimer = null;
      return;
    }
    if (pathTimer) return;
    pathTimer = setInterval(() => {
      if (location.pathname === seenPath) return;
      seenPath = location.pathname;
      refresh();
    }, 300);
  }

  function refresh({ redirect = true } = {}) {
    if (redirect && redirectIfAsked()) return;
    apply();
    styleShadow();
    tidyRules();
    watchDom();
    watchPath();
  }

  // Before anything else, and before the first paint: everything set last time.
  // Not the tokens alone -- the whole pass, so that what the stylesheet cannot
  // name is marked and hidden as it arrives rather than after. Until this, the
  // watching did not begin until storage had answered, and whatever the page
  // drew in the meantime was there to see.
  //
  // Being wrong here costs a moment of the page looking as it did when you
  // left it. Being late costs seeing everything you asked to be rid of.
  //
  // The redirect is left out: it is not a switch, so it is not among the
  // tokens, and acting on a guess about where you want to be sent is worse
  // than waiting the moment it takes to know.
  try {
    const remembered = globalThis.localStorage.getItem(REMEMBERED);
    if (remembered !== null) {
      stored = Object.fromEntries(remembered.split(" ").filter(Boolean).map((key) => [key, true]));
      settings = effective(stored);
      refresh({ redirect: false });
    }
  } catch { /* nothing remembered, or site storage is blocked */ }

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
