import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));

// Every key, in order, with its default. This is the contract the options
// page, the stylesheet gates and the stored settings all share.
const DEFAULTS = [
  // Nothing is on out of the box: a fresh install changes nothing about
  // YouTube until you switch something on.
  "create", "moreFromYoutube", "subscriptionDots", "expandDescription",
  "descriptionChannelLinks", "descriptionCards", "descriptionChips", "footer",
  "ask", "summary", "upcoming", "channelTabs", "channelTabRedirect",
  "stalePlaceholders", "titleCase", "dislikeCount",
  "header", "notifications", "exploreTrending", "subscriptions", "home",
  "homeFeed", "homeToSubscriptions", "shorts", "mixes", "promos",
  "relatedVideos", "recommended", "liveChat", "playlistPanel",
  "fundraiser", "merch", "comments", "profilePhotos", "videoInfo",
  "buttonsBar", "channelRow", "description",
  "autoplay", "endScreenFeed", "endScreenCards", "annotations",
  "searchShelves", "ads",
].map((key) => [key, false]);

const KEYS = DEFAULTS.map(([k]) => k);
const ON_BY_DEFAULT = DEFAULTS.filter(([, on]) => on).map(([k]) => k);
const GROUPS = ["Ads", "Header and sidebar", "Home and feeds", "Watch page", "Player", "Search", "Channel pages"];

// PeaceBeStill comes from another vm realm, so its arrays and objects have foreign
// prototypes; copy them before strict deep-equality.
test("the feature keys are the agreed forty-four, in order, each with a label, a default and a group", () => {
  assert.deepEqual([...PeaceBeStill.KEYS], KEYS);
  for (const [key, label, defaultOn, group] of PeaceBeStill.FEATURES) {
    assert.ok(KEYS.includes(key));
    // Not a placeholder, and not padded: "Hide Home" is as long as it needs.
    assert.ok(label.trim().length > 4 && label === label.trim(), `label for ${key}: ${JSON.stringify(label)}`);
    assert.equal(typeof defaultOn, "boolean", `default for ${key}`);
    assert.ok(GROUPS.includes(group), `group for ${key}: ${group}`);
  }
  assert.deepEqual([...PeaceBeStill.GROUPS], GROUPS);
});

test("every parent named is a real key, and no feature is its own ancestor", () => {
  for (const [key, , , , parent] of PeaceBeStill.FEATURES) {
    if (parent === undefined) continue;
    assert.ok(KEYS.includes(parent), `${key} names unknown parent ${parent}`);
    const seen = new Set([key]);
    for (let p = parent; p; p = PeaceBeStill.parentOf(p)) {
      assert.ok(!seen.has(p), `cycle through ${p}`);
      seen.add(p);
    }
  }
});

test("a feature is moot while any ancestor of it is switched on", () => {
  const moot = PeaceBeStill.isMoot;
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

test("nothing is on by default: the extension does nothing until asked", () => {
  assert.deepEqual({ ...PeaceBeStill.defaults() }, Object.fromEntries(DEFAULTS));
  assert.equal(ON_BY_DEFAULT.length, 0);
  assert.equal(PeaceBeStill.tokensFor({}), "");
});

test("tokensFor lists enabled keys in order; a missing key takes its default", () => {
  assert.equal(PeaceBeStill.tokensFor(undefined), ON_BY_DEFAULT.join(" "));
  assert.equal(PeaceBeStill.tokensFor({}), ON_BY_DEFAULT.join(" "));
  assert.equal(PeaceBeStill.tokensFor({ dislikeCount: true, header: true }), KEYS.filter((k) => ON_BY_DEFAULT.includes(k) || k === "dislikeCount" || k === "header").join(" "));
  assert.equal(PeaceBeStill.tokensFor({ create: false, footer: false }), ON_BY_DEFAULT.filter((k) => k !== "create" && k !== "footer").join(" "));
});

test("tokensFor ignores unknown keys, and treats a non-boolean as no answer", () => {
  // "yes" is not false, so create keeps its default rather than switching off.
  assert.equal(PeaceBeStill.tokensFor({ bogus: true, create: "yes" }), ON_BY_DEFAULT.join(" "));
});

test("a key that is absent, or removed while the page is open, falls back to its default", () => {
  // storage.onChanged reports a removal as a change with no newValue, so the
  // content script can hand us undefined for a key. That must mean "default".
  assert.equal(PeaceBeStill.tokensFor({ create: undefined }), ON_BY_DEFAULT.join(" "));
  assert.equal(PeaceBeStill.tokensFor({ dislikeCount: undefined }), ON_BY_DEFAULT.join(" "));
  assert.equal(PeaceBeStill.isMoot("profilePhotos", { comments: undefined }), false);
  assert.equal(PeaceBeStill.redirectFor("/", { homeToSubscriptions: undefined }), null, "off by default now");
});

test("a value equal to its default is redundant and need not be stored", () => {
  assert.equal(PeaceBeStill.isDefaultValue("footer", false), true);
  assert.equal(PeaceBeStill.isDefaultValue("footer", true), false);
  assert.equal(PeaceBeStill.isDefaultValue("dislikeCount", false), true);
  assert.equal(PeaceBeStill.isDefaultValue("dislikeCount", true), false);
  assert.equal(PeaceBeStill.isDefaultValue("bogus", true), false, "unknown keys are never called redundant");

  assert.deepEqual([...PeaceBeStill.redundantKeys({ footer: false, create: true, dislikeCount: false, bogus: 1 })], ["footer", "dislikeCount"]);
  assert.deepEqual([...PeaceBeStill.redundantKeys({})], []);
  assert.deepEqual([...PeaceBeStill.redundantKeys(undefined)], []);
});

test("formatCount is compact and safe", () => {
  const cases = [[0, "0"], [999, "999"], [1000, "1K"], [1234, "1.2K"], [12345, "12K"], [1500000, "1.5M"], [2000000000, "2B"]];
  for (const [n, expected] of cases) assert.equal(PeaceBeStill.formatCount(n), expected, String(n));
  for (const bad of [-1, NaN, Infinity, undefined, null, "12"]) assert.equal(PeaceBeStill.formatCount(bad), "");
});

test("videoIdFrom reads the v parameter", () => {
  assert.equal(PeaceBeStill.videoIdFrom("?v=jNQXAC9IVRw&t=1s"), "jNQXAC9IVRw");
  assert.equal(PeaceBeStill.videoIdFrom("?list=abc"), null);
  assert.equal(PeaceBeStill.videoIdFrom(""), null);
});

test("channelHomeFor maps a channel's posts/store/community URL to its home, and nothing else", () => {
  assert.equal(PeaceBeStill.channelHomeFor("/@MarkRober/posts"), "/@MarkRober");
  assert.equal(PeaceBeStill.channelHomeFor("/@MarkRober/store/"), "/@MarkRober");
  assert.equal(PeaceBeStill.channelHomeFor("/@MarkRober/community"), "/@MarkRober");
  assert.equal(PeaceBeStill.channelHomeFor("/channel/UCY1kMZp36IQSyNx_9h4mpCg/posts"), "/channel/UCY1kMZp36IQSyNx_9h4mpCg");
  assert.equal(PeaceBeStill.channelHomeFor("/c/markrober/store"), "/c/markrober");
  for (const other of ["/@MarkRober", "/@MarkRober/videos", "/@MarkRober/featured", "/watch", "/feed/subscriptions", "/posts", ""]) {
    assert.equal(PeaceBeStill.channelHomeFor(other), null, other);
  }
});

test("redirectFor sends home to the subscriptions feed and a Short to its watch page, as asked", () => {
  const on = { homeToSubscriptions: true, shorts: true };
  assert.equal(PeaceBeStill.redirectFor("/", on), "/feed/subscriptions");
  assert.equal(PeaceBeStill.redirectFor("/shorts/abc123DEF45", on), "/watch?v=abc123DEF45");
  assert.equal(PeaceBeStill.redirectFor("/watch", on), null);
  assert.equal(PeaceBeStill.redirectFor("/feed/subscriptions", on), null);
  assert.equal(PeaceBeStill.redirectFor("/", { homeToSubscriptions: false, shorts: true }), null);
  assert.equal(PeaceBeStill.redirectFor("/shorts/abc123DEF45", { homeToSubscriptions: true, shorts: false }), null);
  // Never bounce home to a subscriptions page that is itself hidden.
  assert.equal(PeaceBeStill.redirectFor("/", { homeToSubscriptions: true, subscriptions: true }), null);
  // Missing keys take their defaults, and every default is now off.
  assert.equal(PeaceBeStill.redirectFor("/", {}), null);
});

test("effective settings: a missing key is off, and a switch its parent made moot is off too", () => {
  const eff = PeaceBeStill.effective;

  // The bug this exists to prevent: nothing stored must mean nothing runs.
  // Storage holds only what differs from a default, and every default is off,
  // so a fresh install stores {} and every feature must read as off.
  const fresh = eff({});
  assert.deepEqual(Object.entries(fresh).filter(([, on]) => on), [], "a fresh install runs nothing");
  assert.deepEqual({ ...fresh }, { ...PeaceBeStill.defaults() });

  // What the user actually turned on is on.
  assert.equal(eff({ titleCase: true }).titleCase, true);
  assert.equal(eff({ titleCase: false }).titleCase, false);

  // A switch whose parent hides the thing it acts on is forced off, so the
  // content script never works on something already hidden.
  assert.equal(eff({ dislikeCount: true, buttonsBar: true }).dislikeCount, false, "no request for a hidden buttons row");
  assert.equal(eff({ dislikeCount: true }).dislikeCount, true);
  assert.equal(eff({ expandDescription: true, description: true }).expandDescription, false);
  assert.equal(eff({ liveChat: true, relatedVideos: true }).liveChat, false);
  assert.equal(eff({ homeToSubscriptions: true, subscriptions: true }).homeToSubscriptions, false);

  // The parent itself stays on, and junk is ignored.
  assert.equal(eff({ buttonsBar: true }).buttonsBar, true);
  assert.equal(eff({ titleCase: "yes" }).titleCase, false);
  assert.equal(eff(undefined).titleCase, false);
});

test("placeholderVerdict hides a loading block only after it has sat in view with the grid not growing", () => {
  const verdict = PeaceBeStill.placeholderVerdict;
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
  assert.equal(PeaceBeStill.calmTitle("I BUILT A PC IN 24 HOURS"), "I built a pc in 24 hours");
  assert.equal(PeaceBeStill.calmTitle("HELLO WORLD. IT WORKS? I THINK SO! i'm sure"), "Hello world. It works? I think so! I'm sure");
  assert.equal(PeaceBeStill.calmTitle("Normal Title Here"), "Normal Title Here");
  assert.equal(PeaceBeStill.calmTitle("WOW!! THIS IS INSANE. you won't believe what happened"), "WOW!! THIS IS INSANE. you won't believe what happened", "under 80 % upper case");
  assert.equal(PeaceBeStill.calmTitle("NASA"), "NASA", "too short to judge");
  assert.equal(PeaceBeStill.calmTitle(""), "");
  assert.equal(PeaceBeStill.calmTitle(undefined), undefined);
});

test("untitled strips the unread count YouTube prepends to the tab title", () => {
  assert.equal(PeaceBeStill.untitled("(3) Some video - YouTube"), "Some video - YouTube");
  assert.equal(PeaceBeStill.untitled("(12) YouTube"), "YouTube");
  assert.equal(PeaceBeStill.untitled("Some video - YouTube"), "Some video - YouTube");
  assert.equal(PeaceBeStill.untitled("(Live) Concert - YouTube"), "(Live) Concert - YouTube");
});
