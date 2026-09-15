import test from "node:test";
import assert from "node:assert/strict";
import { decide } from "../scripts/autotag.mjs";

// Merging to main releases whatever version main now carries, once: the first
// push that carries a new version tags it, and every push after that finds the
// tag and does nothing.
test("a version with no tag yet is released, under its tag", () => {
  assert.deepEqual(decide("1.1.2", ["v1.1.0", "v1.1.1"]), { release: true, tag: "v1.1.2" });
  assert.deepEqual(decide("1.0.0", []), { release: true, tag: "v1.0.0" });
});

test("a version that is already tagged is not released again", () => {
  const answer = decide("1.1.1", ["v1.1.0", "v1.1.1"]);
  assert.equal(answer.release, false);
  assert.equal(answer.tag, "v1.1.1");
  assert.match(answer.reason, /already tagged/);
});

// AMO takes each version number once, even after that version is deleted, so a
// version that is not above every tag is a mistake -- a bump that went the
// wrong way, or a number already used -- and must fail, not quietly release.
test("a version below or beside the newest tag fails rather than releasing", () => {
  assert.throws(() => decide("1.1.0", ["v1.1.1"]), /1\.1\.0 is not newer than v1\.1\.1/);
  assert.throws(() => decide("1.0.9", ["v1.1.0", "v1.1.1"]), /not newer than v1\.1\.1/);
  // Compared as numbers, not text: 1.10.0 is newer than 1.9.0.
  assert.deepEqual(decide("1.10.0", ["v1.9.0"]), { release: true, tag: "v1.10.0" });
  assert.throws(() => decide("1.9.0", ["v1.10.0"]), /not newer than v1\.10\.0/);
});

test("tags that are not versions are ignored, and a version that is not X.Y.Z fails", () => {
  assert.deepEqual(decide("1.2.0", ["latest", "v1.1.9-rc1", "v1.1.9"]), { release: true, tag: "v1.2.0" });
  assert.throws(() => decide("1.2", ["v1.1.0"]), /not of the form X\.Y\.Z/);
});
