import test from "node:test";
import assert from "node:assert/strict";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));

// Every key, in order, with its default. This is the contract the options
// page, the stylesheet gates and the stored settings all share.
// Every setting, in order, with its default. All the switches are off, and the
// one chooser is empty, so a fresh install changes nothing and stores nothing.
// Every setting, in order, with its default. All the switches are off, and the
// one chooser is empty, so a fresh install changes nothing and stores nothing.
// Every setting, in order, with its default. All the switches are off, and the
// one chooser is empty, so a fresh install changes nothing and stores nothing.
// Every setting, in order, with its default. All the switches are off, and the
// one chooser is empty, so a fresh install changes nothing and stores nothing.
// Every setting, in order, with its default. All the switches are off, and the
// one chooser is empty, so a fresh install changes nothing and stores nothing.
// Every setting, in order, with its default. All the switches are off, and the
// one chooser is empty, so a fresh install changes nothing and stores nothing.
const DEFAULTS = [
  ...["blackout", "home", "feed", "composer", "suggested", "recommended", "socialProof", "homeGames", "news",
    "myNetwork", "networkPeople", "networkSuggestions", "networkGames", "networkPremium", "jobs", "jobsSuggestions",
    "messaging", "notifications", "profile", "profilePeople", "profileSuggestions"].map((key) => [key, false]),
  ["homeRedirect", ""],
  ...["ads", "sponsored", "otherAds", "premium", "jobsPromoted",
    "games", "forBusiness", "siteFooter", "appNag", "aiAssistant",
    "messagingOverlay", "notificationCount"].map((key) => [key, false]),
];

const KEYS = DEFAULTS.map(([k]) => k);
const GROUPS = ["The whole site", "Pages", "Advertisements", "Elsewhere on LinkedIn"];

test("the feature keys are the agreed thirty-four, in order, each with a label, a default and a group", () => {
  assert.deepEqual([...PeaceBeStill.KEYS], KEYS);
  for (const [key, label, defaultOn, group] of PeaceBeStill.FEATURES) {
    assert.ok(KEYS.includes(key), key);
    // Not a placeholder, and not padded: "Hide Home" is as long as it needs.
    assert.ok(label.trim().length > 4 && label === label.trim(), `label for ${key}: ${JSON.stringify(label)}`);
    // A switch defaults to a boolean; the chooser defaults to one of its own
    // values, which is the empty one.
    const choices = PeaceBeStill.choicesFor(key);
    if (choices) assert.ok(choices.some(([choice]) => choice === defaultOn), `default for ${key}`);
    else assert.equal(typeof defaultOn, "boolean", `default for ${key}`);
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
// CSS cannot read a URL, so the content script hands it the destination.
test("pageFor names the destination a path belongs to, and nothing else", () => {
  const page = PeaceBeStill.pageFor;
  assert.equal(page("/"), "home");
  assert.equal(page("/feed/"), "home");
  assert.equal(page("/feed/update/urn:li:activity:1"), "home");
  assert.equal(page("/mynetwork/grow/"), "myNetwork");
  assert.equal(page("/jobs/"), "jobs");
  assert.equal(page("/jobs/view/123"), "jobs");
  assert.equal(page("/messaging/thread/abc"), "messaging");
  assert.equal(page("/notifications/"), "notifications");
  // A path that merely starts with the same letters is not that page.
  assert.equal(page("/feedback"), "");
  assert.equal(page("/jobsomething"), "");
  // Profile has no page of its own: /in/ is where everybody else lives too,
  // and its switch only takes your own menu out of the top bar.
  assert.equal(page("/in/someone"), "");
  assert.equal(page("/search/results/all/"), "");
  assert.equal(page(""), "");
  assert.equal(page(undefined), "");
});

// Each page's suggestion panel is its own feature, and answers to its page.
test("the suggestion panels belong to the pages they appear on", () => {
  for (const [key, page] of [["profileSuggestions", "profile"], ["networkSuggestions", "myNetwork"],
    ["jobsSuggestions", "jobs"], ["networkPeople", "myNetwork"], ["profilePeople", "profile"],
    ["homeGames", "home"], ["networkGames", "myNetwork"], ["networkPremium", "myNetwork"]]) {
    assert.equal(PeaceBeStill.parentOf(key), page, key);
    assert.equal(PeaceBeStill.isMoot(key, { [page]: true }), true, key);
  }
});

// The chat bubble is pinned to every page and the unread count is in the tab
// title, so neither answers to the page it is named after.
test("the overlay and the tab count are independent of their pages", () => {
  assert.equal(PeaceBeStill.parentOf("messagingOverlay"), "blackout");
  assert.equal(PeaceBeStill.parentOf("notificationCount"), "blackout");
  assert.equal(PeaceBeStill.isMoot("messagingOverlay", { messaging: true }), false);
  assert.equal(PeaceBeStill.isMoot("notificationCount", { notifications: true }), false);
});

test("hiding Home takes the feed with it, and the feed takes its own posts", () => {
  // Home is the page the feed lives on, so the feed answers to it.
  assert.equal(PeaceBeStill.parentOf("feed"), "home");
  for (const key of ["composer", "suggested", "recommended", "socialProof"]) {
    assert.equal(PeaceBeStill.isMoot(key, { home: true }), true, key);
  }
  // The redirects are not the feed's business: with the feed gone, being sent
  // somewhere else is more useful, not less.
  assert.equal(PeaceBeStill.isMoot("homeRedirect", { home: true }), false);
});

test("the feed and the advert switch are parents in their own right", () => {
  for (const key of ["suggested", "recommended", "socialProof"]) {
    assert.equal(PeaceBeStill.parentOf(key), "feed", key);
    assert.equal(PeaceBeStill.isMoot(key, { feed: true }), true, key);
  }
  // Every kind of advert answers to one switch, whatever page it is on.
  for (const key of ["sponsored", "otherAds", "premium", "jobsPromoted"]) {
    assert.equal(PeaceBeStill.parentOf(key), "ads", key);
    assert.equal(PeaceBeStill.isMoot(key, { ads: true }), true, key);
    assert.equal(PeaceBeStill.isMoot(key, { feed: true }), false, `${key} is not the feed's business`);
  }
  // The puzzles turn up on more than one page, so they answer to nothing
  // smaller than the whole site.
  for (const key of ["games", "forBusiness"]) {
    assert.equal(PeaceBeStill.parentOf(key), "blackout", key);
  }
  // The news panel is only ever on the home page, so it answers to that.
  assert.equal(PeaceBeStill.parentOf("news"), "home");
  assert.equal(PeaceBeStill.isMoot("news", { home: true }), true);
});

// There is no switch for either column beside the feed. Hiding a whole column
// is a layout change rather than a thing hidden: it takes with it whatever
// LinkedIn has put there today, which is how the site footer went on the older
// front end, and on a phone there are no columns to hide at all. Everything
// that was ever worth hiding in one has a switch of its own.
test("no switch hides a column, only what is in one", () => {
  for (const [key, label] of PeaceBeStill.FEATURES) {
    assert.doesNotMatch(key, /Rail$/, key);
    assert.doesNotMatch(label, /column/i, key);
  }
  assert.ok(!PeaceBeStill.GROUPS.some((group) => /rail/i.test(group)));
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

  const black = eff({ blackout: true, homeRedirect: "jobs", notificationCount: true });
  assert.equal(black.blackout, true);
  assert.equal(black.homeRedirect, "", "the chooser goes back to its own default, not to false");
  assert.equal(black.notificationCount, false);

  assert.equal(eff({ sponsored: true }).sponsored, true);
  assert.equal(eff({ blackout: "yes" }).blackout, false, "junk is not truth");
  assert.equal(eff(undefined).blackout, false);
});

// This is what content.js actually does: effective() first, then tokensFor().
test("the attribute reads exactly 'blackout' while the site is blacked out", () => {
  const { tokensFor, effective } = PeaceBeStill;
  assert.equal(tokensFor(effective({ blackout: true, homeRedirect: "jobs", sponsored: true, games: true })), "blackout");
  assert.equal(tokensFor(effective({ notificationCount: true })), "notificationCount");
  assert.equal(tokensFor(effective({})), "");
});

test("a key that is absent, or removed while the page is open, falls back to its default", () => {
  // storage.onChanged reports a removal as a change with no newValue, so the
  // content script can hand us undefined for a key. That must mean "default".
  assert.equal(PeaceBeStill.tokensFor({ blackout: undefined }), "");
  assert.equal(PeaceBeStill.isMoot("homeToJobs", { blackout: undefined }), false);
  assert.equal(PeaceBeStill.redirectFor("/", { homeRedirect: undefined }), null);
});

test("a value equal to its default is redundant and need not be stored", () => {
  assert.equal(PeaceBeStill.isDefaultValue("blackout", false), true);
  assert.equal(PeaceBeStill.isDefaultValue("blackout", true), false);
  assert.equal(PeaceBeStill.isDefaultValue("bogus", false), false, "unknown keys are never called redundant");
  assert.deepEqual([...PeaceBeStill.redundantKeys({ blackout: false, homeRedirect: "jobs", bogus: 1 })], ["blackout"]);
  assert.equal(PeaceBeStill.isDefaultValue("homeRedirect", ""), true);
  assert.equal(PeaceBeStill.isDefaultValue("homeRedirect", "jobs"), false);
  assert.deepEqual([...PeaceBeStill.redundantKeys({})], []);
  assert.deepEqual([...PeaceBeStill.redundantKeys(undefined)], []);
});

test("redirectFor sends the home page where the chooser says, and nowhere else", () => {
  const r = PeaceBeStill.redirectFor;
  assert.equal(r("/", { homeRedirect: "messaging" }), "/messaging/");
  assert.equal(r("/feed", { homeRedirect: "messaging" }), "/messaging/");
  assert.equal(r("/feed/", { homeRedirect: "notifications" }), "/notifications/");
  assert.equal(r("/", { homeRedirect: "jobs" }), "/jobs/");
  assert.equal(r("/", { homeRedirect: "mynetwork" }), "/mynetwork/");
  // Anywhere that is not the home page is left alone, including the
  // destinations themselves -- otherwise the redirect would loop.
  for (const path of ["/messaging/", "/notifications/", "/jobs/", "/mynetwork/", "/in/someone", ""]) {
    assert.equal(r(path, { homeRedirect: "messaging" }), null, path);
  }
  assert.equal(r(undefined, { homeRedirect: "jobs" }), null);
  assert.equal(r("/", {}), null, "the default is to stay put");
  assert.equal(r("/", { homeRedirect: "" }), null);
});

test("somewhere you have hidden is neither offered nor obeyed", () => {
  const offered = (settings) => [...PeaceBeStill.choicesOffered("homeRedirect", settings)].map(([value]) => value);
  // Listed in the order the top bar lists them, so the two read alike.
  assert.deepEqual(offered({}), ["", "mynetwork", "jobs", "messaging", "notifications", "profile"]);
  assert.deepEqual(offered({ jobs: true }), ["", "mynetwork", "messaging", "notifications", "profile"]);
  assert.deepEqual(offered({ jobs: true, messaging: true }), ["", "mynetwork", "notifications", "profile"]);
  // Your own profile is a place to be sent too, and goes when it is hidden.
  assert.deepEqual(offered({ profile: true }), ["", "mynetwork", "jobs", "messaging", "notifications"]);
  assert.equal(PeaceBeStill.redirectFor("/", { homeRedirect: "profile" }), "/in/me/");
  // And the setting stops working, not just showing: hiding Jobs after picking
  // it must not land you on a page you have taken away.
  assert.equal(PeaceBeStill.redirectFor("/", { homeRedirect: "jobs" }), "/jobs/");
  assert.equal(PeaceBeStill.redirectFor("/", { homeRedirect: "jobs", jobs: true }), null);
  assert.equal(PeaceBeStill.choicesOffered("blackout", {}), null, "a switch offers no choices");
});

test("the chooser takes one of its own values and nothing else", () => {
  const r = PeaceBeStill.redirectFor;
  assert.equal(r("/", { homeRedirect: "bogus" }), null);
  assert.equal(r("/", { homeRedirect: true }), null);
  assert.equal(r("/", { homeRedirect: undefined }), null);
  assert.equal(PeaceBeStill.withDefaults({ homeRedirect: "nowhere" }).homeRedirect, "");
  // And it is the only setting that is not a switch.
  const choosers = PeaceBeStill.FEATURES.filter(([key]) => PeaceBeStill.choicesFor(key));
  assert.deepEqual([...choosers].map(([key]) => key), ["homeRedirect"]);
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
