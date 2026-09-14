import test from "node:test";
import assert from "node:assert/strict";
import { whyNotYouTube } from "../audit/served.mjs";

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
