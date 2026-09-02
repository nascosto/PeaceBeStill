import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic } from "./helpers/load-classic.mjs";

const css = readFileSync(new URL("../src/tidy.css", import.meta.url), "utf8");
const { YtTidy } = loadClassic("src/tidy-core.js");
const SCRIPT_ONLY = ["expandDescription", "titleCase", "dislikeCount"];
const gates = [...css.matchAll(/html\[data-yt-tidy~="([^"]+)"\]/g)].map((m) => m[1]);

test("every gate in tidy.css is a known feature key", () => {
  for (const gate of gates) assert.ok(YtTidy.KEYS.includes(gate), `unknown gate ${gate}`);
});

test("every hiding feature has a gate; script-only features have none", () => {
  for (const key of YtTidy.KEYS.filter((k) => !SCRIPT_ONLY.includes(k))) assert.ok(gates.includes(key), `no rule gated on ${key}`);
  for (const key of SCRIPT_ONLY) assert.ok(!gates.includes(key), `${key} should not be in the stylesheet`);
});

test("rules only ever hide; nothing is styled beyond display:none", () => {
  const declarations = [...css.matchAll(/\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.ok(declarations.length >= 7);
  for (const d of declarations) assert.equal(d, "display: none !important;");
});
