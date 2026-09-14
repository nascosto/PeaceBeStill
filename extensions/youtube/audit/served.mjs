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
