import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

const css = readFileSync(new URL("../src/hide.css", import.meta.url), "utf8");
const { PeaceBeStill } = loadClassic(new URL("../src/core.js", import.meta.url));
// Features with no stylesheet rule at all: pure script.
const SCRIPT_ONLY = ["channelTabRedirect", "stalePlaceholders", "titleCase", "dislikeCount", "homeToSubscriptions"];
// The only declarations a rule may carry. Hiding, plus the one layout fix
// hiding the header needs (the page otherwise keeps a gap where it was).
const ALLOWED = new Set(["display: none !important;", "margin-top: 0 !important;"]);
const gates = [...css.matchAll(/html\[data-peacebestill~="([^"]+)"\]/g)].map((m) => m[1]);

test("every gate in tidy.css is a known feature key", () => {
  for (const gate of gates) assert.ok(PeaceBeStill.KEYS.includes(gate), `unknown gate ${gate}`);
});

test("every non-script feature has a gate; script-only features have none", () => {
  for (const key of PeaceBeStill.KEYS.filter((k) => !SCRIPT_ONLY.includes(k))) assert.ok(gates.includes(key), `no rule gated on ${key}`);
  for (const key of SCRIPT_ONLY) assert.ok(!gates.includes(key), `${key} should not be in the stylesheet`);
});

test("rules only hide, or zero a top margin", () => {
  const declarations = [...css.matchAll(/\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.ok(declarations.length >= 30);
  for (const d of declarations) assert.ok(ALLOWED.has(d), `unexpected declaration: ${d}`);
});
