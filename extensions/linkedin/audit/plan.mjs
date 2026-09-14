// What a live:linkedin run will cost in page loads, worked out from the same
// plan live.mjs follows, so the budget it claims up front is the budget it
// spends. Guessing "about two a page" undercounted the home page by seven, and
// a run claimed within budget was then stopped halfway by its own real total.

// Whether a page has its redirect choices checked. Only the home page is ever
// redirected, so only there are they worth asking. live.mjs uses this too.
export function checksRedirects(path, { redirectFor }) {
  return redirectFor(path, {}) !== null || path === "/feed/" || path === "/";
}

// The loads for one run over `paths`:
//  - the tab LinkedIn is opened in, once per run;
//  - every page: the visit, and the return after blackout replaces it;
//  - a page with redirects: one load per destination, and the return after;
//  - plus the switches that take a page away and so send the tab elsewhere,
//    each costing a load to come back. On the home page that is Home itself,
//    and a spare is allowed, since which switches move the tab depends on
//    what LinkedIn draws that day.
export function plannedLoads(paths, core) {
  const destinations = (core.choicesFor("homeRedirect") || [])
    .filter(([value]) => core.redirectFor("/feed/", { homeRedirect: value }) !== null).length;
  return paths.reduce((total, path) => total + 2 + (checksRedirects(path, core) ? destinations + 1 + 2 : 0), 1);
}
