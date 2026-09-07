// Runs at document_start on youtube.com. Keeps the root element's
// data-peacebestill attribute equal to the enabled feature keys (hide.css does
// the hiding), opens the video description, calms ALL-CAPS titles, prunes the
// loading placeholders a feed leaves behind, and shows the dislike count when
// asked.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { KEYS, tokensFor, effective, formatCount, videoIdFrom, calmTitle, channelHomeFor, redirectFor, placeholderVerdict, untitled } = globalThis.PeaceBeStill;

  // What storage holds, and what that means once defaults are filled in and
  // anything a parent switch has made moot is forced off. Only `settings` is
  // ever read, and every read tests for truth: storage keeps only values that
  // differ from a default, so an absent key means off and must never be
  // mistaken for on.
  let stored = {};
  let settings = effective(stored);

  // YouTube is a single-page app: the watch page appears after its own
  // navigation event, not a page load, and its parts arrive a little after
  // that. Every one-off DOM lookup below retries briefly, acts once, and stops.
  // YouTube also keeps hidden duplicates of some controls around (the dislike
  // button exists three times on a watch page), so by default only a rendered
  // match counts. Controls this extension hides itself are the exception, and
  // pass visible: false.
  const RETRY_MS = 250;
  const RETRY_LIMIT = 40; // ~10 s

  function whenPresent(selector, then, { visible = true } = {}) {
    let attempts = 0;
    const tick = () => {
      const matches = [...document.querySelectorAll(selector)];
      const element = visible ? matches.find((e) => e.getClientRects().length > 0) : matches[0];
      if (element) return then(element);
      if (++attempts < RETRY_LIMIT) setTimeout(tick, RETRY_MS);
    };
    tick();
  }

  function apply() {
    document.documentElement.dataset.peacebestill = tokensFor(settings);
  }

  function onWatchPage() {
    return location.pathname.startsWith("/watch");
  }

  // --- Description expansion -----------------------------------------------
  function expandDescription() {
    if (!settings.expandDescription || !onWatchPage()) return;
    whenPresent("#description-inline-expander", (expander) => {
      if (!expander.hasAttribute("is-expanded")) expander.querySelector("#expand")?.click();
    });
  }

  // --- Dislike count -------------------------------------------------------
  // YouTube stopped publishing dislikes in 2021. Return YouTube Dislike keeps
  // an estimate per video and serves it with open CORS, so a content-script
  // fetch needs no extra permission. Off unless switched on, and forced off
  // when the buttons row it attaches to is hidden, so it never asks a third
  // party about a video for a number nobody could see.
  const RYD = "https://returnyoutubedislikeapi.com/votes?videoId=";
  let currentVideo = null;

  function removeDislikes() {
    currentVideo = null;
    document.querySelector(".peacebestill-dislikes")?.remove();
  }

  async function showDislikes() {
    const videoId = onWatchPage() ? videoIdFrom(location.search) : null;
    if (!settings.dislikeCount || !videoId) return;
    currentVideo = videoId;
    let dislikes;
    try {
      const response = await fetch(RYD + encodeURIComponent(videoId));
      if (!response.ok) return;
      ({ dislikes } = await response.json());
    } catch {
      return;
    }
    if (currentVideo !== videoId) return; // navigated away while waiting
    whenPresent("dislike-button-view-model button", (button) => {
      if (currentVideo !== videoId) return;
      let span = button.querySelector(".peacebestill-dislikes");
      if (!span) {
        span = document.createElement("span");
        span.className = "peacebestill-dislikes";
        span.style.marginLeft = "6px";
        button.append(span);
        // The dislike button is an icon-only shape with a fixed width, so the
        // number would be clipped: drop the icon-only variant and let it size
        // itself like the like button beside it.
        for (const cls of [...button.classList]) if (/iconbutton/i.test(cls)) button.classList.remove(cls);
        button.style.width = "auto";
      }
      span.textContent = formatCount(dislikes);
    });
  }

  // --- Autoplay --------------------------------------------------------------
  // YouTube remembers the autoplay toggle, so switching it off once sticks.
  // hide.css hides that toggle, which is the point of the switch, so this must
  // look for it whether or not it is rendered -- a hidden button still takes a
  // click. Only ever switches it off; turning the feature off leaves YouTube's
  // own setting alone.
  function switchAutoplayOff() {
    if (!settings.autoplay || !onWatchPage()) return;
    whenPresent('.ytp-autonav-toggle-button[aria-checked="true"]', (toggle) => toggle.click(), { visible: false });
  }

  // --- ALL-CAPS titles -------------------------------------------------------
  // Old markup names the title #video-title (search results, older grids); the
  // newer "lockup" markup used by the watch sidebar and the home grid puts it
  // in an anchor inside yt-lockup-metadata-view-model's h3.
  const TITLE_SELECTOR = "#video-title, a#video-title-link, ytd-watch-metadata h1 yt-formatted-string, yt-lockup-metadata-view-model h3 a";

  function calmTitles() {
    for (const element of document.querySelectorAll(TITLE_SELECTOR)) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const calm = calmTitle(node.nodeValue);
        if (calm !== node.nodeValue) node.nodeValue = calm;
      }
      if (element.title) {
        const calm = calmTitle(element.title);
        if (calm !== element.title) element.title = calm;
      }
    }
  }

  // --- Description bottom ----------------------------------------------------
  // The block of cards under the description text has a 16px top margin. With
  // every card hidden it is an empty block whose margin still pushes the box's
  // bottom edge down, so drop the margin while nothing in it is rendered, and
  // give it back the moment something is.
  function tightenDescription() {
    if (!settings.expandDescription) return;
    const block = document.querySelector("#description-inline-expander #structured-description");
    if (!block) return;
    const anythingShown = [...block.querySelectorAll("*")].some((e) => e.getBoundingClientRect().height > 0);
    block.style.marginTop = anythingShown ? "" : "0";
  }

  // --- Stale feed placeholders -----------------------------------------------
  // YouTube fetches more of a feed when its "loading more" block scrolls into
  // view, so that block must stay in the page while a feed is live. At the end
  // of a feed (or when an ad blocker eats the request) it is sometimes left
  // behind, ghost cards and spinner and all. placeholderVerdict hides a block
  // that has sat in view for STALE_MS with the grid not growing, and brings it
  // back the moment the grid grows. Scrolling does not mutate the DOM, so a
  // scroll listener and a timer feed this as well as the observer.
  const STALE_MS = 6000;
  const placeholders = new WeakMap();
  let staleTimer = null;

  function pruneStalePlaceholders() {
    const blocks = document.querySelectorAll("ytd-rich-grid-renderer ytd-continuation-item-renderer");
    if (!settings.stalePlaceholders) {
      for (const block of blocks) block.style.display = "";
      return;
    }
    const now = Date.now();
    let waiting = false;
    for (const block of blocks) {
      const items = block.closest("ytd-rich-grid-renderer").querySelectorAll("ytd-rich-item-renderer").length;
      const inView = block.getBoundingClientRect().top < window.innerHeight;
      const { record, hide } = placeholderVerdict(placeholders.get(block), now, items, inView, STALE_MS);
      placeholders.set(block, record);
      block.style.display = hide ? "none" : "";
      if (!hide && record.since != null) waiting = true;
    }
    clearTimeout(staleTimer);
    if (waiting) staleTimer = setTimeout(pruneStalePlaceholders, STALE_MS + 100);
  }

  // --- Tab title -------------------------------------------------------------
  // With the bell hidden, the "(3)" YouTube prepends to the tab title is noise
  // too. YouTube rewrites the title on every navigation, so the observer
  // re-applies this.
  function calmTabTitle() {
    if (!settings.notifications) return;
    const calm = untitled(document.title);
    if (calm !== document.title) document.title = calm;
  }

  // --- Redirects -------------------------------------------------------------
  // Pages that go somewhere else instead: a channel's Posts / Store page to the
  // channel home (channelTabRedirect), the home page to the Subscriptions feed
  // (homeToSubscriptions), a Short to its ordinary watch page (shorts).
  function redirectIfAsked() {
    const target = (settings.channelTabRedirect && channelHomeFor(location.pathname)) || redirectFor(location.pathname, settings);
    if (!target) return false;
    location.replace(target);
    return true;
  }

  // --- The observer ----------------------------------------------------------
  // One observer serves every job that has to be redone as YouTube renders.
  // Its own debounce is separate from the scroll one below, so a long scroll
  // cannot keep starving the title pass.
  let observer = null;
  let observeTimer = null;
  let scrollTimer = null;

  function observe() {
    if (settings.titleCase) calmTitles();
    tightenDescription();
    pruneStalePlaceholders();
    calmTabTitle();
  }

  function watchDom() {
    const wanted = settings.titleCase || settings.expandDescription || settings.stalePlaceholders || settings.notifications;
    if (!wanted) {
      observer?.disconnect();
      observer = null;
      return;
    }
    observe();
    if (observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(observeTimer);
      observeTimer = setTimeout(observe, 200);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  // --- Wiring ----------------------------------------------------------------
  function refresh() {
    if (redirectIfAsked()) return;
    apply();
    switchAutoplayOff();
    expandDescription();
    removeDislikes();
    showDislikes();
    watchDom();
  }

  api.storage.sync.get(KEYS).then((values) => {
    stored = values;
    settings = effective(stored);
    refresh();
  }).catch(() => {
    // Storage unavailable: the defaults are off, so do nothing at all.
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

  // Registered once, not per observer, so toggling a switch cannot pile up
  // listeners. Scrolling only ever needs the placeholder check.
  window.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(pruneStalePlaceholders, 200);
  }, { passive: true });

  document.addEventListener("yt-navigate-finish", refresh);
})();
