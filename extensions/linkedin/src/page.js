// What every PeaceBeStill content script does the same way, whatever the site:
// reading its settings, remembering them for the next load, redoing its work as
// the page changes, and sending the logo where the home page would go.
//
// This file lives in shared/ and is copied into each extension's src/ by
// scripts/sync-shared.mjs; test/shared.test.mjs fails if a copy differs. It is
// a classic script loaded before content.js, and reads the page's globals
// when called, not when loaded, so a test can hand it a fake page.
(function (root) {
  // --- Remembered settings -----------------------------------------------------
  // storage.sync answers a moment after the page starts drawing, so anything
  // hidden only once it has answered is seen first. What was applied last time
  // is kept in the site's own localStorage -- the one store a content script
  // can read without waiting -- and put on the page before it is painted.
  //
  // The site's scripts can read that store, and it outlives the extension, so
  // nothing is kept there that is not needed: a value that is empty, meaning
  // nothing is switched on, removes its key rather than storing "". Turning
  // everything off therefore leaves nothing behind.
  function recall(key) {
    try {
      return root.localStorage.getItem(key);
    } catch {
      return null; // site storage can be blocked
    }
  }

  function remember(key, value) {
    try {
      if (value === "" || value === null || value === undefined) root.localStorage.removeItem(key);
      else if (root.localStorage.getItem(key) !== value) root.localStorage.setItem(key, value);
    } catch {
      // Blocked. The page simply draws before the settings arrive.
    }
  }

  // --- Settings ----------------------------------------------------------------
  // Hands onSettings what storage holds now, and again after every change. A
  // removal arrives with no newValue and is dropped, so the key falls back to
  // its default rather than reading as "off". If storage cannot be read at all,
  // that is the defaults -- every one of them off -- not a page left untouched.
  function listen(api, keys, onSettings) {
    let stored = {};
    api.storage.sync.get(keys)
      .then((values) => { stored = values || {}; })
      .catch(() => { stored = {}; })
      .then(() => onSettings(stored));
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const [key, change] of Object.entries(changes)) {
        if ("newValue" in change) stored[key] = change.newValue;
        else delete stored[key];
      }
      onSettings(stored);
    });
  }

  // --- Redoing work as the page changes ---------------------------------------
  // One observer per page. `immediate` runs in the observer's own turn, before
  // the browser paints, so what it hides is never seen; `settled` runs once
  // things have gone quiet, for whatever arrives after the element holding it.
  // Work that measures the page belongs in `settled`: measuring on every
  // mutation forces a layout each time.
  function watchMutations({ immediate, settled, settleMs = 200 }) {
    let observer = null;
    let timer = null;
    return {
      start() {
        if (observer) return;
        observer = new root.MutationObserver(() => {
          if (immediate) immediate();
          if (settled) {
            root.clearTimeout(timer);
            timer = root.setTimeout(settled, settleMs);
          }
        });
        observer.observe(root.document.documentElement, { childList: true, subtree: true, characterData: true });
      },
      stop() {
        if (observer) observer.disconnect();
        observer = null;
        root.clearTimeout(timer);
      },
    };
  }

  // --- The logo ------------------------------------------------------------------
  // The logo goes home, and home may be a page you have asked never to see.
  // Rather than going there and being sent away -- the page seen, then left --
  // a click on the logo goes straight to where the home page would send you.
  // Caught at the document on the way down, before the site's own handler, and
  // only when there is somewhere else to be.
  let following = false;

  function followLogo(isLogo, destination) {
    if (following || !root.document.addEventListener) return;
    following = true;
    root.document.addEventListener("click", (event) => {
      const goes = destination();
      if (!goes) return;
      const target = event.target;
      if (!target || typeof target.closest !== "function" || !isLogo(target)) return;
      event.preventDefault();
      event.stopPropagation();
      root.location.assign(goes);
    }, true);
  }

  root.PeaceBeStillPage = { recall, remember, listen, watchMutations, followLogo };
})(globalThis);
