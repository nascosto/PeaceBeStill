// Runs at document_start on youtube.com. Keeps the root element's data-yt-tidy
// attribute equal to the enabled feature keys (tidy.css does the hiding), opens
// the description on each watch page, calms ALL-CAPS titles, and shows the
// dislike count when asked.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { KEYS, tokensFor, formatCount, videoIdFrom, calmTitle } = globalThis.YtTidy;
  let settings = {};

  // YouTube is a single-page app: the watch page appears after its own
  // navigation event, not a page load, and its parts arrive a little after
  // that. Every one-off DOM lookup below retries briefly, acts once, and stops.
  const RETRY_MS = 250;
  const RETRY_LIMIT = 40; // ~10 s

  function whenPresent(selector, then) {
    let attempts = 0;
    const tick = () => {
      const element = document.querySelector(selector);
      if (element) return then(element);
      if (++attempts < RETRY_LIMIT) setTimeout(tick, RETRY_MS);
    };
    tick();
  }

  function apply() {
    document.documentElement.dataset.ytTidy = tokensFor(settings);
  }

  function onWatchPage() {
    return location.pathname.startsWith("/watch");
  }

  // --- Description expansion -----------------------------------------------
  function expandDescription() {
    if (settings.expandDescription === false || !onWatchPage()) return;
    whenPresent("#description-inline-expander", (expander) => {
      if (!expander.hasAttribute("is-expanded")) expander.querySelector("#expand")?.click();
    });
  }

  // --- Dislike count -------------------------------------------------------
  // YouTube stopped publishing dislikes in 2021. Return YouTube Dislike keeps
  // an estimate per video and serves it with open CORS, so a content-script
  // fetch needs no extra permission. Off by default (see tidy-core.js).
  const RYD = "https://returnyoutubedislikeapi.com/votes?videoId=";
  let currentVideo = null;

  function removeDislikes() {
    currentVideo = null;
    document.querySelector(".yt-tidy-dislikes")?.remove();
  }

  async function showDislikes() {
    const videoId = onWatchPage() ? videoIdFrom(location.search) : null;
    if (settings.dislikeCount !== true || !videoId) return;
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
      let span = button.querySelector(".yt-tidy-dislikes");
      if (!span) {
        span = document.createElement("span");
        span.className = "yt-tidy-dislikes";
        span.style.marginLeft = "6px";
        button.append(span);
      }
      span.textContent = formatCount(dislikes);
    });
  }

  // --- ALL-CAPS titles -------------------------------------------------------
  // Titles render and re-render as YouTube streams results in, so this is the
  // one place an observer stays on: a debounced pass over title elements that
  // rewrites text nodes which are shouting (calmTitle leaves the rest alone).
  // Text nodes only, never elements, so YouTube's markup survives.
  const TITLE_SELECTOR = "#video-title, a#video-title-link, ytd-watch-metadata h1 yt-formatted-string";
  let titleObserver = null;
  let titleTimer = null;

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

  function watchTitles() {
    if (settings.titleCase === false) {
      titleObserver?.disconnect();
      titleObserver = null;
      return;
    }
    calmTitles();
    if (titleObserver) return;
    titleObserver = new MutationObserver(() => {
      clearTimeout(titleTimer);
      titleTimer = setTimeout(calmTitles, 200);
    });
    titleObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  // --- Wiring ----------------------------------------------------------------
  function refresh() {
    apply();
    expandDescription();
    removeDislikes();
    showDislikes();
    watchTitles();
  }

  api.storage.sync.get(KEYS).then((stored) => {
    settings = stored;
    refresh();
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
    refresh();
  });

  document.addEventListener("yt-navigate-finish", refresh);
})();
