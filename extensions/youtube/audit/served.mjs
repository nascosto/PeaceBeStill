// What an audit was actually shown, checked before anything is measured.
//
// A page that is not YouTube has none of YouTube's parts, so every switch
// reads 0/0 and the run passes -- a run that measured nothing, looking like a
// run where everything worked. It happened: after a day of headless loads
// Google answered this network with google.com/sorry, and audit:mobile printed
// "0 failure(s)" over a Google page.
//
// Returns null when the page is the YouTube host expected, and otherwise why
// the run must stop.
import { challengedAt } from "../../../scripts/audit-budget.mjs";

export function whyNotYouTube(url, expectedHost) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `the audit was not shown a page at all (${url})`;
  }
  if (parsed.host === expectedHost) return null;
  const challenge = challengedAt(url);
  if (challenge && /unusual-traffic/.test(challenge)) {
    return "Google is rate-limiting this network (google.com/sorry: unusual traffic). Stop sending YouTube headless traffic and try again in a few hours; nothing was measured.";
  }
  if (challenge) return `YouTube served ${challenge} (${parsed.host}) instead; nothing was measured.`;
  return `expected ${expectedHost} but was served ${parsed.host}${parsed.pathname}; nothing was measured.`;
}

// YouTube's check for an ad blocker, as uBlock Origin's volunteers found it in
// June 2025 (uBlockOrigin/uAssets#27415): a bare div#player-ads appended to
// <body>, and an ad blocker assumed if it comes out display: none. Run on the
// real page with the ads switch on, it must stay visible: if it is hidden, the
// extension would get a real user's videos refused. A script body, so it runs
// the same through puppeteer and Marionette.
export const AD_BLOCKER_BAIT = `
  const bait = document.createElement("div");
  bait.id = "player-ads";
  document.body.appendChild(bait);
  const hidden = getComputedStyle(bait).display === "none";
  bait.remove();
  return { adsSwitchOn: (document.documentElement.dataset.peacebestill || "").split(" ").includes("ads"), baitHidden: hidden };`;

// Why a bait result fails the run, or null when it passes.
export function baitProblem(result) {
  if (!result) return "the ad-blocker bait check did not run";
  if (!result.adsSwitchOn) return "the ads switch was not on when the ad-blocker bait was checked, so the check proved nothing";
  if (result.baitHidden) return "YouTube's ad-blocker bait (div#player-ads on <body>) was hidden: YouTube would refuse to play for this user";
  return null;
}
