// Runs at document_start on linkedin.com. Keeps the root element's
// data-peacebestill attribute equal to the enabled feature keys -- hide.css does
// the hiding, and for blackout the drawing -- sends the home page elsewhere
// when asked, and keeps the tab title in step with both.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { KEYS, BLACKOUT_TITLE, tokensFor, effective, redirectFor, titleFor } = globalThis.PeaceBeStill;

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

  function redirectIfAsked() {
    const target = redirectFor(location.pathname, settings);
    if (!target) return false;
    location.replace(target);
    return true;
  }

  // LinkedIn is a single-page app and rewrites the title as it navigates, so
  // the title work is redone on mutation rather than set once. The observer
  // runs only while a switch needs it, and its callback is debounced so a
  // busy feed cannot starve the page.
  let observer = null;
  let observeTimer = null;

  function watchDom() {
    // Always: this is also how the title is put back when blackout goes off.
    keepTitle();
    if (!(settings.blackout || settings.notificationCount)) {
      observer?.disconnect();
      observer = null;
      return;
    }
    if (observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(observeTimer);
      observeTimer = setTimeout(keepTitle, 200);
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
})();
