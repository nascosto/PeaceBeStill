import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "./helpers/load-classic.mjs";

const { YtTidy } = loadClassic("src/tidy-core.js");
const KEYS = [
  "create", "moreFromYoutube", "subscriptionDots", "expandDescription",
  "descriptionChannelLinks", "descriptionCards", "descriptionChips", "footer", "ask", "summary", "upcoming", "channelTabs", "titleCase", "dislikeCount",
];
const ON_BY_DEFAULT = KEYS.filter((k) => k !== "dislikeCount");

// YtTidy comes from another vm realm, so its arrays and objects have foreign
// prototypes; copy them before strict deep-equality.
test("the feature keys are the agreed fourteen, in order, each with a label and a default", () => {
  assert.deepEqual([...YtTidy.KEYS], KEYS);
  for (const [key, label, defaultOn] of YtTidy.FEATURES) {
    assert.ok(KEYS.includes(key));
    assert.ok(label.length > 10, `label for ${key}`);
    assert.equal(typeof defaultOn, "boolean", `default for ${key}`);
  }
});

test("everything is on by default except the dislike count", () => {
  assert.deepEqual({ ...YtTidy.defaults() }, { ...Object.fromEntries(KEYS.map((k) => [k, true])), dislikeCount: false });
});

test("tokensFor lists enabled keys in order; a missing key takes its default", () => {
  assert.equal(YtTidy.tokensFor(undefined), ON_BY_DEFAULT.join(" "));
  assert.equal(YtTidy.tokensFor({}), ON_BY_DEFAULT.join(" "));
  assert.equal(YtTidy.tokensFor({ dislikeCount: true }), KEYS.join(" "));
  assert.equal(
    YtTidy.tokensFor({ create: false, footer: false }),
    "moreFromYoutube subscriptionDots expandDescription descriptionChannelLinks descriptionCards descriptionChips ask summary upcoming channelTabs titleCase",
  );
});

test("tokensFor ignores unknown keys and non-boolean values", () => {
  assert.equal(YtTidy.tokensFor({ bogus: true, create: "yes" }), ON_BY_DEFAULT.filter((k) => k !== "create").join(" "));
});

test("formatCount is compact and safe", () => {
  const cases = [[0, "0"], [999, "999"], [1000, "1K"], [1234, "1.2K"], [12345, "12K"], [1500000, "1.5M"], [2000000000, "2B"]];
  for (const [n, expected] of cases) assert.equal(YtTidy.formatCount(n), expected, String(n));
  for (const bad of [-1, NaN, Infinity, undefined, null, "12"]) assert.equal(YtTidy.formatCount(bad), "");
});

test("videoIdFrom reads the v parameter", () => {
  assert.equal(YtTidy.videoIdFrom("?v=jNQXAC9IVRw&t=1s"), "jNQXAC9IVRw");
  assert.equal(YtTidy.videoIdFrom("?list=abc"), null);
  assert.equal(YtTidy.videoIdFrom(""), null);
});

test("channelHomeFor maps a channel's posts/store/community URL to its home, and nothing else", () => {
  assert.equal(YtTidy.channelHomeFor("/@MarkRober/posts"), "/@MarkRober");
  assert.equal(YtTidy.channelHomeFor("/@MarkRober/store/"), "/@MarkRober");
  assert.equal(YtTidy.channelHomeFor("/@MarkRober/community"), "/@MarkRober");
  assert.equal(YtTidy.channelHomeFor("/channel/UCY1kMZp36IQSyNx_9h4mpCg/posts"), "/channel/UCY1kMZp36IQSyNx_9h4mpCg");
  assert.equal(YtTidy.channelHomeFor("/c/markrober/store"), "/c/markrober");
  for (const other of ["/@MarkRober", "/@MarkRober/videos", "/@MarkRober/featured", "/watch", "/feed/subscriptions", "/posts", ""]) {
    assert.equal(YtTidy.channelHomeFor(other), null, other);
  }
});

test("calmTitle rewrites a shouting title in sentence case and leaves everything else alone", () => {
  assert.equal(YtTidy.calmTitle("I BUILT A PC IN 24 HOURS"), "I built a pc in 24 hours");
  assert.equal(YtTidy.calmTitle("HELLO WORLD. IT WORKS? I THINK SO! i'm sure"), "Hello world. It works? I think so! I'm sure");
  assert.equal(YtTidy.calmTitle("Normal Title Here"), "Normal Title Here");
  assert.equal(YtTidy.calmTitle("WOW!! THIS IS INSANE. you won't believe what happened"), "WOW!! THIS IS INSANE. you won't believe what happened", "under 80 % upper case");
  assert.equal(YtTidy.calmTitle("NASA"), "NASA", "too short to judge");
  assert.equal(YtTidy.calmTitle(""), "");
  assert.equal(YtTidy.calmTitle(undefined), undefined);
});
