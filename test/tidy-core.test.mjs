import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "./helpers/load-classic.mjs";

const { YtTidy } = loadClassic("src/tidy-core.js");

// Every key, in order, with its default. This is the contract the options
// page, the stylesheet gates and the stored settings all share.
const DEFAULTS = [
  ["create", true], ["moreFromYoutube", true], ["subscriptionDots", true], ["expandDescription", true],
  ["descriptionChannelLinks", true], ["descriptionCards", true], ["descriptionChips", true], ["footer", true],
  ["ask", true], ["summary", true], ["upcoming", true], ["channelTabs", true], ["channelTabRedirect", true],
  ["stalePlaceholders", true], ["titleCase", true], ["dislikeCount", false],
  // Ported from Unhook, defaults as Ben had them set there.
  ["header", false], ["notifications", true], ["exploreTrending", false], ["subscriptions", false],
  ["homeFeed", true], ["homeToSubscriptions", true], ["shorts", true], ["mixes", true], ["promos", true],
  ["relatedVideos", true], ["recommended", true], ["liveChat", true], ["playlistPanel", true],
  ["fundraiser", true], ["merch", true], ["comments", false], ["profilePhotos", false], ["videoInfo", false],
  ["buttonsBar", false], ["channelRow", false], ["description", false],
  ["autoplay", true], ["endScreenFeed", true], ["endScreenCards", true], ["annotations", true],
  ["searchShelves", true],
];
const KEYS = DEFAULTS.map(([k]) => k);
const ON_BY_DEFAULT = DEFAULTS.filter(([, on]) => on).map(([k]) => k);
const GROUPS = ["Header and sidebar", "Home and feeds", "Watch page", "Player", "Search", "Channel pages"];

// YtTidy comes from another vm realm, so its arrays and objects have foreign
// prototypes; copy them before strict deep-equality.
test("the feature keys are the agreed forty-two, in order, each with a label, a default and a group", () => {
  assert.deepEqual([...YtTidy.KEYS], KEYS);
  for (const [key, label, defaultOn, group] of YtTidy.FEATURES) {
    assert.ok(KEYS.includes(key));
    assert.ok(label.length > 10, `label for ${key}`);
    assert.equal(typeof defaultOn, "boolean", `default for ${key}`);
    assert.ok(GROUPS.includes(group), `group for ${key}: ${group}`);
  }
  assert.deepEqual([...YtTidy.GROUPS], GROUPS);
});

test("every parent named is a real key, and no feature is its own ancestor", () => {
  for (const [key, , , , parent] of YtTidy.FEATURES) {
    if (parent === undefined) continue;
    assert.ok(KEYS.includes(parent), `${key} names unknown parent ${parent}`);
    const seen = new Set([key]);
    for (let p = parent; p; p = YtTidy.parentOf(p)) {
      assert.ok(!seen.has(p), `cycle through ${p}`);
      seen.add(p);
    }
  }
});

test("a feature is moot while any ancestor of it is switched on", () => {
  const moot = YtTidy.isMoot;
  // Hiding the whole top bar makes its parts moot.
  assert.equal(moot("create", { header: true }), true);
  assert.equal(moot("notifications", { header: true }), true);
  assert.equal(moot("create", { header: false }), false);
  // Hiding the description makes everything inside it moot.
  for (const child of ["expandDescription", "descriptionCards", "summary"]) {
    assert.equal(moot(child, { description: true }), true, child);
    assert.equal(moot(child, { description: false }), false, child);
  }
  // Hiding the column beside the video, the comments, the buttons row.
  assert.equal(moot("liveChat", { relatedVideos: true }), true);
  assert.equal(moot("profilePhotos", { comments: true }), true);
  assert.equal(moot("dislikeCount", { buttonsBar: true }), true);
  // Cross-section: hiding Subscriptions strands the home redirect.
  assert.equal(moot("homeToSubscriptions", { subscriptions: true }), true);
  assert.equal(moot("homeToSubscriptions", {}), false, "subscriptions is off by default");
  // A parent, and an unknown key, are never moot.
  assert.equal(moot("header", { header: true }), false);
  assert.equal(moot("bogus", { header: true }), false);
});

test("defaults are exactly the agreed ones", () => {
  assert.deepEqual({ ...YtTidy.defaults() }, Object.fromEntries(DEFAULTS));
});

test("tokensFor lists enabled keys in order; a missing key takes its default", () => {
  assert.equal(YtTidy.tokensFor(undefined), ON_BY_DEFAULT.join(" "));
  assert.equal(YtTidy.tokensFor({}), ON_BY_DEFAULT.join(" "));
  assert.equal(YtTidy.tokensFor({ dislikeCount: true, header: true }), KEYS.filter((k) => ON_BY_DEFAULT.includes(k) || k === "dislikeCount" || k === "header").join(" "));
  assert.equal(YtTidy.tokensFor({ create: false, footer: false }), ON_BY_DEFAULT.filter((k) => k !== "create" && k !== "footer").join(" "));
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

test("redirectFor sends home to the subscriptions feed and a Short to its watch page, as asked", () => {
  const on = { homeToSubscriptions: true, shorts: true };
  assert.equal(YtTidy.redirectFor("/", on), "/feed/subscriptions");
  assert.equal(YtTidy.redirectFor("/shorts/abc123DEF45", on), "/watch?v=abc123DEF45");
  assert.equal(YtTidy.redirectFor("/watch", on), null);
  assert.equal(YtTidy.redirectFor("/feed/subscriptions", on), null);
  assert.equal(YtTidy.redirectFor("/", { homeToSubscriptions: false, shorts: true }), null);
  assert.equal(YtTidy.redirectFor("/shorts/abc123DEF45", { homeToSubscriptions: true, shorts: false }), null);
  // Never bounce home to a subscriptions page that is itself hidden.
  assert.equal(YtTidy.redirectFor("/", { homeToSubscriptions: true, subscriptions: true }), null);
  // Missing keys take their defaults (both on).
  assert.equal(YtTidy.redirectFor("/", {}), "/feed/subscriptions");
});

test("placeholderVerdict hides a loading block only after it has sat in view with the grid not growing", () => {
  const verdict = YtTidy.placeholderVerdict;
  let { record, hide } = verdict(undefined, 1000, 20, true, 6000);
  assert.equal(hide, false);
  assert.deepEqual({ ...record }, { since: 1000, items: 20 });
  ({ record, hide } = verdict(record, 6900, 20, true, 6000));
  assert.equal(hide, false);
  ({ record, hide } = verdict(record, 7000, 20, true, 6000));
  assert.equal(hide, true);
  ({ record, hide } = verdict(record, 7100, 32, true, 6000));
  assert.equal(hide, false);
  assert.deepEqual({ ...record }, { since: 7100, items: 32 });
  ({ record, hide } = verdict(undefined, 1000, 20, false, 6000));
  assert.equal(hide, false);
  assert.equal(record.since, null);
  ({ record, hide } = verdict(record, 20000, 20, false, 6000));
  assert.equal(hide, false);
  ({ record, hide } = verdict(record, 20000, 20, true, 6000));
  assert.equal(hide, false);
  assert.equal(record.since, 20000);
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

test("untitled strips the unread count YouTube prepends to the tab title", () => {
  assert.equal(YtTidy.untitled("(3) Some video - YouTube"), "Some video - YouTube");
  assert.equal(YtTidy.untitled("(12) YouTube"), "YouTube");
  assert.equal(YtTidy.untitled("Some video - YouTube"), "Some video - YouTube");
  assert.equal(YtTidy.untitled("(Live) Concert - YouTube"), "(Live) Concert - YouTube");
});
