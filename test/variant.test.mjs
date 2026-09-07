import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selfHostedId, selfHostedManifest, DEFAULT_REPO } from "../scripts/variant.mjs";

const source = {
  manifest_version: 3,
  name: "PeaceBeStill - YouTube",
  version: "1.2.3",
  permissions: ["storage"],
  browser_specific_settings: { gecko: { id: "youtube@example.invalid", strict_min_version: "142.0" } },
};

test("the self-hosted add-on ID is the store one marked, splitting on the last @", () => {
  assert.equal(selfHostedId("youtube@example.invalid"), "youtube-selfhosted@example.invalid");
  assert.equal(selfHostedId("a@b@c"), "a@b-selfhosted@c");
  assert.throws(() => selfHostedId("nope"), /local@domain/);
});

test("the self-hosted manifest adds both update_url keys, at the constant latest-release URLs", () => {
  const built = selfHostedManifest(source, { repo: "owner/name", assets: "peacebestill-youtube" });
  const base = "https://github.com/owner/name/releases/latest/download/peacebestill-youtube";
  assert.equal(built.update_url, `${base}-updates.xml`);
  assert.equal(built.browser_specific_settings.gecko.update_url, `${base}-updates.json`);
  assert.equal(built.browser_specific_settings.gecko.id, "youtube-selfhosted@example.invalid");
});

test("nothing else about the manifest changes, and the source object is left alone", () => {
  const built = selfHostedManifest(source, { assets: "peacebestill-youtube" });
  assert.deepEqual(
    { ...built, update_url: undefined, browser_specific_settings: undefined },
    { ...source, update_url: undefined, browser_specific_settings: undefined },
  );
  assert.equal(built.browser_specific_settings.gecko.strict_min_version, "142.0");
  assert.equal(source.update_url, undefined, "the input is not mutated");
  assert.equal(source.browser_specific_settings.gecko.id, "youtube@example.invalid");
  assert.match(built.update_url, new RegExp(`^https://github\\.com/${DEFAULT_REPO}/`), "the repo defaults");
});

test("it refuses to build a manifest that could not be updated or identified", () => {
  assert.throws(() => selfHostedManifest(source, {}), /asset prefix/);
  assert.throws(() => selfHostedManifest({ ...source, browser_specific_settings: {} }, { assets: "x" }), /gecko\.id/);
});

// The stores reject a package that names its own update service, so a stray
// update_url in the source tree breaks both uploads at once -- and only at
// upload time, long after CI has gone green.
test("every extension's source manifest stays clean enough for the stores", () => {
  for (const src of ["extensions/youtube/src"]) {
    const manifest = JSON.parse(readFileSync(`${src}/manifest.json`, "utf8"));
    assert.equal(manifest.update_url, undefined, `${src} must not carry a Chromium update_url`);
    assert.equal(manifest.browser_specific_settings?.gecko?.update_url, undefined, `${src} must not carry a Firefox update_url`);
    assert.match(manifest.browser_specific_settings.gecko.id, /^[^@]+@/, `${src} needs a gecko ID`);
  }
});
