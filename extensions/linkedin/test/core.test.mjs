import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));

// Every key, in order, with its default. This is the contract the options
// page, the stylesheet gates and the stored settings all share.
const DEFAULTS = [
  "blackout",
  "feed", "homeToMessaging", "homeToNotifications", "homeToJobs",
  "sponsored", "suggested", "recommended", "socialProof",
  "rightRail", "leftRail",
  "otherAds", "games", "news", "premium",
  "forBusiness", "jobsPromoted", "peopleYouMayKnow", "suggestions", "composer", "aiAssistant",
  "notificationCount",
].map((key) => [key, false]);

const KEYS = DEFAULTS.map(([k]) => k);
const GROUPS = ["The whole site", "Home and feed", "Feed posts", "Side rails", "Elsewhere on LinkedIn", "Notifications"];

test("the feature keys are the agreed twenty-two, in order, each with a label, a default and a group", () => {
  assert.deepEqual([...PeaceBeStill.KEYS], KEYS);
  for (const [key, label, defaultOn, group] of PeaceBeStill.FEATURES) {
    assert.ok(KEYS.includes(key), key);
    assert.ok(label.length > 10, `label for ${key}`);
    assert.equal(typeof defaultOn, "boolean", `default for ${key}`);
    assert.ok(GROUPS.includes(group), `group for ${key}: ${group}`);
  }
  assert.deepEqual([...PeaceBeStill.GROUPS], GROUPS);
});

test("nothing is on by default: the extension does nothing until asked", () => {
  assert.deepEqual({ ...PeaceBeStill.defaults() }, Object.fromEntries(DEFAULTS));
  assert.equal(PeaceBeStill.tokensFor({}), "");
  assert.equal(PeaceBeStill.tokensFor(undefined), "");
});

// The whole design of the options page rests on this: blackout hides the
// entire site, so nothing else can have any effect while it is on.
test("blackout is top level and an ancestor of every other switch", () => {
  assert.equal(PeaceBeStill.parentOf("blackout"), null);
  for (const key of KEYS.filter((k) => k !== "blackout")) {
    const chain = [];
    for (let p = PeaceBeStill.parentOf(key); p; p = PeaceBeStill.parentOf(p)) chain.push(p);
    assert.ok(chain.includes("blackout"), `${key} does not descend from blackout (chain: ${chain})`);
  }
});

// The middle of the chain matters too: a post kind cannot matter with the feed
// gone, and a rail module cannot matter with the rail gone.
test("feed and rightRail are parents in their own right", () => {
  for (const key of ["sponsored", "suggested", "recommended", "socialProof"]) {
    assert.equal(PeaceBeStill.parentOf(key), "feed", key);
    assert.equal(PeaceBeStill.isMoot(key, { feed: true }), true, key);
  }
  // The puzzles, the news panel and the adverts turn up outside the right rail
  // too, so hiding the rail must not grey them out.
  for (const key of ["games", "news", "otherAds", "premium"]) {
    assert.equal(PeaceBeStill.parentOf(key), "blackout", key);
    assert.equal(PeaceBeStill.isMoot(key, { rightRail: true }), false, key);
  }
});

// The feed labels are the only durable hook: LinkedIn's class names are hashed
// and rotate per deploy, and CSS cannot select on text, so content.js reads
// these and marks the item for the stylesheet to hide.
test("kindsFor reads a feed item's kind from the short labels in its header", () => {
  const k = PeaceBeStill.kindsFor;
  assert.deepEqual([...k(["Promoted"])], ["sponsored"]);
  assert.deepEqual([...k(["Sponsored"])], ["sponsored"]);
  assert.deepEqual([...k(["Suggested"])], ["suggested"]);
  assert.deepEqual([...k(["Suggested for you"])], ["suggested"]);
  assert.deepEqual([...k(["Recommended for you"])], ["recommended"]);
  assert.deepEqual([...k(["Jane Doe likes this"])], ["socialProof"]);
  assert.deepEqual([...k(["Jane Doe commented on this"])], ["socialProof"]);
  assert.deepEqual([...k(["Jane Doe reposted this"])], ["socialProof"]);
  // An ordinary post, and a post that merely mentions the word, are untouched:
  // only an exact label match counts.
  assert.deepEqual([...k(["Some ordinary post"])], []);
  assert.deepEqual([...k(["We just promoted three people"])], []);
  assert.deepEqual([...k([])], []);
  assert.deepEqual([...k(undefined)], []);
});

test("blackout makes every other switch moot, and nothing is moot without it", () => {
  for (const key of KEYS.filter((k) => k !== "blackout")) {
    assert.equal(PeaceBeStill.isMoot(key, { blackout: true }), true, key);
    assert.equal(PeaceBeStill.isMoot(key, {}), false, key);
    assert.equal(PeaceBeStill.isMoot(key, { blackout: false }), false, key);
  }
  assert.equal(PeaceBeStill.isMoot("blackout", { blackout: true }), false, "a parent is never moot");
  assert.equal(PeaceBeStill.isMoot("bogus", { blackout: true }), false, "unknown keys are never moot");
});

test("no feature is its own ancestor, and every parent named is a real key", () => {
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

test("effective: a fresh install runs nothing, and blackout forces everything else off", () => {
  const eff = PeaceBeStill.effective;
  assert.deepEqual(Object.entries(eff({})).filter(([, on]) => on), [], "a fresh install runs nothing");
  assert.deepEqual({ ...eff({}) }, { ...PeaceBeStill.defaults() });

  const black = eff({ blackout: true, homeToJobs: true, notificationCount: true });
  assert.equal(black.blackout, true);
  assert.equal(black.homeToJobs, false);
  assert.equal(black.notificationCount, false);

  assert.equal(eff({ homeToJobs: true }).homeToJobs, true);
  assert.equal(eff({ blackout: "yes" }).blackout, false, "junk is not truth");
  assert.equal(eff(undefined).blackout, false);
});

// This is what content.js actually does: effective() first, then tokensFor().
test("the attribute reads exactly 'blackout' while the site is blacked out", () => {
  const { tokensFor, effective } = PeaceBeStill;
  assert.equal(tokensFor(effective({ blackout: true, homeToJobs: true, sponsored: true, games: true })), "blackout");
  assert.equal(tokensFor(effective({ notificationCount: true })), "notificationCount");
  assert.equal(tokensFor(effective({})), "");
});

test("a key that is absent, or removed while the page is open, falls back to its default", () => {
  // storage.onChanged reports a removal as a change with no newValue, so the
  // content script can hand us undefined for a key. That must mean "default".
  assert.equal(PeaceBeStill.tokensFor({ blackout: undefined }), "");
  assert.equal(PeaceBeStill.isMoot("homeToJobs", { blackout: undefined }), false);
  assert.equal(PeaceBeStill.redirectFor("/", { homeToJobs: undefined }), null);
});

test("a value equal to its default is redundant and need not be stored", () => {
  assert.equal(PeaceBeStill.isDefaultValue("blackout", false), true);
  assert.equal(PeaceBeStill.isDefaultValue("blackout", true), false);
  assert.equal(PeaceBeStill.isDefaultValue("bogus", false), false, "unknown keys are never called redundant");
  assert.deepEqual([...PeaceBeStill.redundantKeys({ blackout: false, homeToJobs: true, bogus: 1 })], ["blackout"]);
  assert.deepEqual([...PeaceBeStill.redundantKeys({})], []);
  assert.deepEqual([...PeaceBeStill.redundantKeys(undefined)], []);
});

test("redirectFor sends the home page where asked, and leaves every other page alone", () => {
  const r = PeaceBeStill.redirectFor;
  assert.equal(r("/", { homeToMessaging: true }), "/messaging/");
  assert.equal(r("/feed", { homeToMessaging: true }), "/messaging/");
  assert.equal(r("/feed/", { homeToNotifications: true }), "/notifications/");
  assert.equal(r("/", { homeToJobs: true }), "/jobs/");
  // Anywhere that is not the home page is left alone, including the
  // destinations themselves -- otherwise the redirect would loop.
  for (const path of ["/messaging/", "/notifications/", "/jobs/", "/in/someone", "/feed/update/urn:li:activity:1", ""]) {
    assert.equal(r(path, { homeToMessaging: true, homeToNotifications: true, homeToJobs: true }), null, path);
  }
  assert.equal(r(undefined, { homeToJobs: true }), null);
  assert.equal(r("/", {}), null, "off by default");
});

test("with more than one destination on, the first in table order wins", () => {
  const r = PeaceBeStill.redirectFor;
  assert.equal(r("/", { homeToMessaging: true, homeToNotifications: true, homeToJobs: true }), "/messaging/");
  assert.equal(r("/", { homeToNotifications: true, homeToJobs: true }), "/notifications/");
  assert.equal(r("/", { homeToJobs: true }), "/jobs/");
});

test("a blacked-out site never navigates", () => {
  assert.equal(PeaceBeStill.redirectFor("/", { blackout: true, homeToJobs: true }), null);
});

test("untitled strips the unread count LinkedIn prepends to the tab title", () => {
  assert.equal(PeaceBeStill.untitled("(3) Feed | LinkedIn"), "Feed | LinkedIn");
  assert.equal(PeaceBeStill.untitled("(12) Messaging | LinkedIn"), "Messaging | LinkedIn");
  assert.equal(PeaceBeStill.untitled("Feed | LinkedIn"), "Feed | LinkedIn");
  assert.equal(PeaceBeStill.untitled("(New) Something | LinkedIn"), "(New) Something | LinkedIn", "only digits are a count");
});

test("titleFor: blackout says the sentence, notificationCount drops the count, null means leave it", () => {
  const t = PeaceBeStill.titleFor;
  const SAID = PeaceBeStill.BLACKOUT_TITLE;
  assert.equal(SAID, "You made the right choice.");

  assert.equal(t("(3) Feed | LinkedIn", { blackout: true }), SAID);
  assert.equal(t(SAID, { blackout: true }), null, "already right, nothing to do");
  assert.equal(t("(3) Feed | LinkedIn", { notificationCount: true }), "Feed | LinkedIn");
  assert.equal(t("Feed | LinkedIn", { notificationCount: true }), null);
  assert.equal(t("(3) Feed | LinkedIn", {}), null, "both switches off");
  // Blackout wins: it is the parent, and the page says the same thing.
  assert.equal(t("(3) Feed | LinkedIn", { blackout: true, notificationCount: true }), SAID);
});
