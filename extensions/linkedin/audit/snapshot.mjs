// Sent into the page and run there. It is written as a real function and
// stringified rather than spelled out in a template literal: a template drops a
// lone backslash, so /\s+/ arrived as /s+/ and split the mark attribute on the
// letter s -- quietly losing every kind with one in its name, which was most of
// them. Stringifying a function keeps the source exactly as written.
export function snapshot(probeSelectors, probeText, shadowSelectors) {
  const shown = (selector) => [...document.querySelectorAll(selector)]
    .filter((e) => e.getClientRects().length).length;
  const shownText = (needle) => [...document.querySelectorAll("h1,h2,h3,p,span,div,button")]
    .filter((e) => !e.children.length && (e.textContent || "").trim().startsWith(needle) && e.getClientRects().length).length;
  // Only the posts themselves. A carousel of recommended posts is a list item
  // holding more list items, and counting the inner ones made one panel going
  // away look like four posts going away.
  const topLevelFeedItems = () => [...document.querySelectorAll('[data-testid="mainFeed"] [role="listitem"]')]
    .filter((e) => e.getClientRects().length && !e.parentElement.closest('[role="listitem"]')).length;
  const out = {
    path: location.pathname,
    // Null while the page is being replaced -- which happens here, because
    // hiding a page sends you off it while we are looking at it.
    attr: document.documentElement ? document.documentElement.getAttribute("data-peacebestill") : null,
    probes: {},
    feedItems: topLevelFeedItems(),
    marks: {},
  };
  // What the extension itself marked, and how much of it still renders. This
  // is the extension's own record, not the harness's, and it tells "took
  // nothing" apart from "had nothing to take".
  for (const el of document.querySelectorAll("[data-pbs]")) {
    for (const kind of (el.getAttribute("data-pbs") || "").split(/\s+/).filter(Boolean)) {
      const seen = out.marks[kind] || (out.marks[kind] = { found: 0, showing: 0 });
      seen.found++;
      if (el.getClientRects().length) seen.showing++;
    }
  }
  for (const [name, selector] of Object.entries(probeSelectors)) out.probes[name] = shown(selector);
  for (const [name, needle] of Object.entries(probeText)) out.probes[name] = shownText(needle);

  // The overlays -- the chat bubble and the AI assistant -- live in a shadow
  // root, which document.querySelectorAll cannot see into. Hiding them means a
  // stylesheet injected inside that root, so an audit looking only at the
  // document proves nothing about them either way, and said so by reporting
  // there was nothing there to hide. There was.
  const host = document.querySelector('#interop-outlet, [data-testid="interop-shadowdom"]');
  const shadow = host && host.shadowRoot;
  for (const [name, selector] of Object.entries(shadowSelectors)) {
    out.probes[name] = shadow
      ? [...shadow.querySelectorAll(selector)].filter((e) => e.getClientRects().length).length
      : 0;
  }

  // The unread count is in the tab title, not on the page at all.
  out.title = document.title;
  out.probes["unread count in the title"] = /^\(\d+\)\s/.test(document.title) ? 1 : 0;
  return out;
}
