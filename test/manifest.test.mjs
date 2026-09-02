import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));

test("manifest is MV3 with the agreed identity", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "YouTube Tidy");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.browser_specific_settings.gecko.id, "youtube-tidy@peacebestill.fyi");
  // 142 is the first Firefox, desktop and Android alike, that knows
  // data_collection_permissions; below it the linter warns.
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "142.0");
});

test("manifest asks for nothing beyond storage and youtube.com", () => {
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts.map((c) => c.matches), [["*://www.youtube.com/*"]]);
  assert.equal(manifest.background, undefined);
});

test("content script loads the core before the script that uses it, at document_start", () => {
  const [cs] = manifest.content_scripts;
  assert.deepEqual(cs.js, ["tidy-core.js", "content.js"]);
  assert.deepEqual(cs.css, ["tidy.css"]);
  assert.equal(cs.run_at, "document_start");
});

test("declares data collection: none required, browsing activity optional (the dislike count)", () => {
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, {
    required: ["none"],
    optional: ["browsingActivity"],
  });
});

test("update URLs point at the constant latest-release assets", () => {
  const base = "https://github.com/nascosto/youtube-tidy/releases/latest/download/";
  assert.equal(manifest.browser_specific_settings.gecko.update_url, base + "updates.json");
  assert.equal(manifest.update_url, base + "updates.xml");
});
