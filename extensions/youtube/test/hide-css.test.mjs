import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic, loadCore } from "../../../test/helpers/load-classic.mjs";

const css = readFileSync(new URL("../src/hide.css", import.meta.url), "utf8");
const { PeaceBeStill } = loadCore(new URL("../src/", import.meta.url));
// Features with no stylesheet rule at all: pure script. (homeToSubscriptions
// left this list when it began hiding the way back to Home as well.)
const SCRIPT_ONLY = ["channelTabRedirect", "stalePlaceholders", "titleCase", "dislikeCount"];
const HIDE = "display: none !important;";
// What hiding the header may do besides hide: give back the room the page, the
// narrow sidebar and the phone's sticky player all keep clear for the bar.
const HEADER_LAYOUT = new Set([HIDE, "margin-top: 0 !important;", "padding-top: 0 !important;", "top: 0 !important;"]);
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2].trim() }));
const gated = rules.map((r) => ({ ...r, gate: (/^html\[data-peacebestill~="([^"]+)"\]/.exec(r.selector) || [])[1] }));
const gates = gated.map((r) => r.gate).filter(Boolean);

test("every rule is gated on a switch, so a fresh install changes nothing", () => {
  assert.ok(rules.length >= 30);
  for (const { selector, gate } of gated) assert.ok(gate, `ungated rule: ${selector.slice(0, 80)}`);
});

test("every gate in hide.css is a known feature key", () => {
  for (const gate of gates) assert.ok(PeaceBeStill.KEYS.includes(gate), `unknown gate ${gate}`);
});

test("every non-script feature has a gate; script-only features have none", () => {
  for (const key of PeaceBeStill.KEYS.filter((k) => !SCRIPT_ONLY.includes(k))) assert.ok(gates.includes(key), `no rule gated on ${key}`);
  for (const key of SCRIPT_ONLY) assert.ok(!gates.includes(key), `${key} should not be in the stylesheet`);
});

test("header is the only gate exempt from the hiding-only rule", () => {
  const exempt = [...new Set(gated.filter((r) => r.body !== HIDE).map((r) => r.gate))];
  assert.deepEqual(exempt, ["header"]);
});

test("every rule but header's only hides, and header's only hide or give back the bar's room", () => {
  for (const { gate, body } of gated) {
    if (gate === "header") assert.ok(HEADER_LAYOUT.has(body), `header: ${body}`);
    else assert.equal(body, HIDE, gate);
  }
});

// audit:mobile tells a phone rule from a desktop one by which side of this
// heading it sits on. Without the heading, or with phone rules above it, the
// audit would quietly stop checking them.
test("the phone's rules have a section of their own, which the mobile audit splits on", () => {
  const heading = "/* ---- Firefox for Android (m.youtube.com)";
  assert.equal(css.split(heading).length - 1, 1, "the section heading must appear exactly once");
  const after = css.slice(css.indexOf(heading));
  const phoneRules = [...after.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/html\[data-peacebestill~="[^"]+"\]/g)].length;
  assert.ok(phoneRules >= 15, `only ${phoneRules} rules after the heading`);
  const before = css.slice(0, css.indexOf(heading)).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(before, /\bytm-(?!mweb)[a-z-]+/, "a phone component in the desktop section would be audited as a desktop rule");
});
