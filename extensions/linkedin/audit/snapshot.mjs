// Sent into the page and run there. It is written as a real function and
// stringified rather than spelled out in a template literal: a template drops a
// lone backslash, so /\s+/ arrived as /s+/ and split the mark attribute on the
// letter s -- quietly losing every kind with one in its name, which was most of
// them. Stringifying a function keeps the source exactly as written.
export function snapshot(probeSelectors, probeText) {
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
    attr: document.documentElement.getAttribute("data-peacebestill"),
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
  return out;
}
