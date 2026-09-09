import { linkedInTab } from "./tmp-rdp.mjs";
const { evaluate, goTo, close } = await linkedInTab();

const PROBE = `JSON.stringify((() => {
  const short = (s) => (s||"").trim();
  const leaf = [...document.querySelectorAll("span,p,h1,h2,h3,button,a")].filter(e => !e.children.length);
  const texts = leaf.map(e => short(e.textContent)).filter(t => t && t.length < 60);
  const WORDS = ["Promoted","Sponsored","Suggested","Suggested for you","Recommended for you","People you may know",
    "Add to your feed","LinkedIn News","Top stories","Try Premium for £0","Retry Premium","Reactivate Premium",
    "Who's viewed your profile","Games","Show all","Easy Apply","Premium","Open to work","More suggestions for you"];
  const words = {};
  for (const w of WORDS) { const n = texts.filter(t => t === w).length; if (n) words[w] = n; }
  // aria-labels that look structural, not personal (drop anything with a comma
  // or that is long -- those are people's names and headlines).
  const aria = (sel) => [...document.querySelectorAll(sel)]
    .map(e => short(e.getAttribute("aria-label")))
    .filter(a => a && a.length < 60 && !a.includes(","));
  const testids = [...new Set([...document.querySelectorAll("[data-testid]")]
    .map(e => e.getAttribute("data-testid")))]
    .filter(t => t.length < 26 && !/[A-Z]{6,}|==|\\+/.test(t));
  return {
    path: location.pathname,
    asides: aria("aside[aria-label]"),
    sections: aria("section[aria-label]").slice(0, 8),
    navs: aria("nav[aria-label]").slice(0, 5),
    testids,
    lists: [...document.querySelectorAll('[role="list"]')].map(l => ({
      testid: l.getAttribute("data-testid") || "(none)",
      items: l.querySelectorAll(':scope > [role="listitem"]').length,
    })),
    listitems: document.querySelectorAll('[role="listitem"]').length,
    games: document.querySelectorAll('div[aria-label^="Play "]').length,
    words,
  };
})())`;

const PAGES = ["/feed/", "/mynetwork/grow/", "/jobs/", "/notifications/", "/messaging/",
               "/search/results/all/?keywords=nodejs", "/in/me/"];
for (const path of PAGES) {
  try {
    await goTo("https://www.linkedin.com" + path);
    await new Promise(r => setTimeout(r, 2500));
    console.log("=== " + path + "\n" + await evaluate(PROBE) + "\n");
  } catch (e) { console.log("=== " + path + " FAILED: " + e.message + "\n"); }
}
close();
