import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const version = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8")).version;
const script = fileURLToPath(new URL("../scripts/check-version.mjs", import.meta.url));
const run = (tag) => spawnSync(process.execPath, [script, tag], { encoding: "utf8" });

test("accepts the tag that matches the manifest", () => {
  assert.equal(run(`v${version}`).status, 0);
});

test("rejects any other tag, naming both", () => {
  const result = run("v0.0.1");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /v0\.0\.1/);
  assert.match(result.stderr, new RegExp(version.replace(/\./g, "\\.")));
});
