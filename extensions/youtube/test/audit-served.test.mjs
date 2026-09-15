import test from "node:test";
import assert from "node:assert/strict";
import { whyNotYouTube, baitProblem } from "../audit/served.mjs";

// The audits check what they were served before measuring, because a page that
// is not YouTube reads as every switch passing.
test("the audits stop on a page that is not YouTube, and say why", () => {
  assert.equal(whyNotYouTube("https://m.youtube.com/watch?v=dQw4w9WgXcQ", "m.youtube.com"), null);
  assert.equal(whyNotYouTube("https://www.youtube.com/", "www.youtube.com"), null);
  assert.match(whyNotYouTube("https://www.google.com/sorry/index?continue=https://m.youtube.com/watch", "m.youtube.com"), /rate-limiting this network/);
  assert.match(whyNotYouTube("https://consent.youtube.com/m?continue=x", "www.youtube.com"), /consent page/);
  assert.match(whyNotYouTube("https://www.youtube.com/watch?v=x", "m.youtube.com"), /expected m\.youtube\.com but was served www\.youtube\.com/);
  assert.match(whyNotYouTube("about:blank", "m.youtube.com"), /expected m\.youtube\.com/);
  assert.match(whyNotYouTube("not a url", "m.youtube.com"), /not shown a page at all/);
});

// The live audits run YouTube's own ad-blocker check on the real page. A run
// that never switched ads on, or never ran the check, must not read as a pass.
test("the ad-blocker bait fails a run when hidden, and when the check proved nothing", () => {
  assert.equal(baitProblem({ adsSwitchOn: true, baitHidden: false }), null);
  assert.match(baitProblem({ adsSwitchOn: true, baitHidden: true }), /refuse to play/);
  assert.match(baitProblem({ adsSwitchOn: false, baitHidden: false }), /proved nothing/);
  assert.match(baitProblem(undefined), /did not run/);
});
