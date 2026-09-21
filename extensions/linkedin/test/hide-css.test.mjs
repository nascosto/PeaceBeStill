import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic, loadCore } from "../../../test/helpers/load-classic.mjs";

const css = readFileSync(new URL("../src/hide.css", import.meta.url), "utf8");
const { PeaceBeStill } = loadCore(new URL("../src/", import.meta.url));

// Features with no stylesheet rule at all: pure script.
const SCRIPT_ONLY = ["homeRedirect", "notificationCount"];
const HIDE = "display: none !important;";

const rules = [...css.matchAll(/html\[data-peacebestill~="([^"]+)"\][^{]*\{([^}]*)\}/g)]
  .map((m) => ({ gate: m[1], body: m[2].trim() }));
const gates = rules.map((r) => r.gate);

test("every gate in hide.css is a known feature key", () => {
  assert.ok(rules.length > 0, "the stylesheet has no gated rules at all");
  for (const gate of gates) assert.ok(PeaceBeStill.KEYS.includes(gate), `unknown gate ${gate}`);
});

test("every non-script feature has a gate; script-only features have none", () => {
  for (const key of PeaceBeStill.KEYS.filter((k) => !SCRIPT_ONLY.includes(k))) {
    assert.ok(gates.includes(key), `no rule gated on ${key}`);
  }
  for (const key of SCRIPT_ONLY) assert.ok(!gates.includes(key), `${key} should not be in the stylesheet`);
});

// Blackout has to draw a sentence as well as hide the page, so it is the one
// gate allowed to do anything but hide. Naming it keeps the guard meaningful:
// widening the allowed declarations instead would permit anything anywhere.
test("blackout is the only gate exempt from the hiding-only rule", () => {
  const exempt = [...new Set(rules.filter((r) => r.body !== HIDE).map((r) => r.gate))];
  assert.deepEqual(exempt, ["blackout"]);
});

test("every rule but blackout's only hides", () => {
  for (const { gate, body } of rules) {
    if (gate === "blackout") continue;
    assert.equal(body, HIDE, gate);
  }
});

// The tab and the page must say the same thing; core.js owns the sentence.
test("blackout hides the page and draws the sentence core.js puts in the tab", () => {
  const blackout = rules.filter((r) => r.gate === "blackout");
  assert.ok(blackout.some((r) => r.body === HIDE), "blackout must hide the page");
  assert.ok(
    css.includes(`content: "${PeaceBeStill.BLACKOUT_TITLE}";`),
    `the stylesheet must draw ${JSON.stringify(PeaceBeStill.BLACKOUT_TITLE)}`,
  );
});

// LinkedIn ships a dark mode. An inherited colour could land dark text on a
// dark ground, so blackout states both.
test("the blackout text states its own colours", () => {
  const drawn = rules.find((r) => r.gate === "blackout" && r.body.includes("content:"));
  assert.ok(drawn, "no rule draws the sentence");
  assert.match(drawn.body, /color:/);
  assert.ok(rules.some((r) => r.gate === "blackout" && /background:/.test(r.body)), "the page needs a ground of its own");
});

// The top bar is drawn by two front ends, and a switch written for one of them
// finds nothing on the other: "For Business" was hidden in the new bar and left
// standing in the old one for as long as the old one's rule asked for a label
// it does not carry. So every top-bar switch names its item in both.
const selectorsFor = (gate) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^}]*\}/g)]
  .flatMap((m) => m[1].split(","))
  .map((s) => s.trim())
  .filter((s) => s.startsWith(`html[data-peacebestill~="${gate}"]`));

test("every top-bar switch hides its item in both front ends' bars", () => {
  for (const gate of ["home", "myNetwork", "jobs", "messaging", "notifications", "profile", "forBusiness"]) {
    const selectors = selectorsFor(gate);
    assert.ok(selectors.some((s) => s.includes('[data-testid="primary-nav"] li')), `${gate}: no rule for the new bar`);
    assert.ok(selectors.some((s) => s.includes("li.global-nav__primary-item")), `${gate}: no rule for the old bar`);
  }
});

// "Hire with AI" in the new bar and "Post a job" in the old one are the same
// link under two names, and a name is the one thing about it that changes --
// with the front end and with the language. Where it goes does not.
test("business features take the hiring link from both bars, by where it goes", () => {
  const selectors = selectorsFor("forBusiness");
  for (const bar of ['[data-testid="primary-nav"] li', "li.global-nav__primary-item"]) {
    assert.ok(
      selectors.some((s) => s.includes(bar) && s.includes('a[href*="/talent/job-posting-redirect"]')),
      `no rule takes the hiring link from ${bar}`,
    );
  }
});

// Your own menu in the old bar carries an upsell and a way into LinkedIn's
// hiring tools. Each belongs to the switch for what it is, and -- like the
// hiring link -- is named by where it goes. The advert switch repeats what
// Premium does, so it takes the upsell too.
//
// Only the item whose own link it is: each section of that menu is an item of
// the same class holding a list of them, so an item merely containing the link
// is the whole section -- and took Settings, Help and Language with the trial.
test("the old bar's own menu loses its Premium trial and its job-posting account, and nothing beside them", () => {
  const item = (href) => `li.global-nav__secondary-item:has(> a[href*="${href}"])`;
  const takes = (gate, href) => selectorsFor(gate).some((s) => s.endsWith(item(href)));
  for (const gate of ["premium", "ads", "forBusiness"]) {
    for (const s of selectorsFor(gate).filter((s) => s.includes("li.global-nav__secondary-item"))) {
      assert.match(s, /li\.global-nav__secondary-item:has\(> /, `${gate} takes a whole section of the menu: ${s}`);
    }
  }
  assert.ok(takes("premium", "/premium/products"), "Premium adverts leave the trial in the menu");
  assert.ok(takes("ads", "/premium/products"), "every advert at once leaves the trial in the menu");
  assert.ok(takes("forBusiness", "/talent/job-management-redirect"), "business features leave the job-posting account in the menu");
});
