import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextVersion, versionedFiles } from "../scripts/bump.mjs";

test("a bump is a keyword or an exact version, and anything else is refused", () => {
  assert.equal(nextVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(nextVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
  assert.equal(nextVersion("1.2.3", "4.0.1"), "4.0.1");
  assert.throws(() => nextVersion("1.2.3", "1.2"), /not major, minor, patch/);
  assert.throws(() => nextVersion("1.2.3", ""), /not major, minor, patch/);
  assert.throws(() => nextVersion("1.2", "patch"), /not X\.Y\.Z/);
});

// The release guard compares the tag against exactly these files, so the two
// lists have to be the same one.
test("every versioned file is found, and they already agree", () => {
  const files = versionedFiles();
  assert.equal(files[0], "package.json");
  assert.ok(files.includes("extensions/youtube/src/manifest.json"));
  const versions = new Set(files.map((f) => JSON.parse(readFileSync(f, "utf8")).version));
  assert.equal(versions.size, 1, `versions disagree across ${files.join(", ")}`);
});
