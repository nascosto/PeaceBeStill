import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { selfHostedManifest } from "../../../scripts/variant.mjs";

const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));

test("manifest is MV3 with the agreed identity", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "PeaceBeStill - YouTube");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.browser_specific_settings.gecko.id, "youtube@peacebestill.fyi");
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
  assert.deepEqual(cs.js, ["core.js", "content.js"]);
  assert.deepEqual(cs.css, ["hide.css"]);
  assert.equal(cs.run_at, "document_start");
});

test("declares data collection: none required, browsing activity optional (the dislike count)", () => {
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, {
    required: ["none"],
    optional: ["browsingActivity"],
  });
});

test("icons are declared at every size a browser asks for, and the files exist", () => {
  const sizes = ["16", "32", "48", "96", "128"];
  assert.deepEqual(Object.keys(manifest.icons ?? {}), sizes);
  for (const size of sizes) {
    assert.equal(manifest.icons[size], `icons/icon-${size}.png`);
    const file = new URL(`../src/${manifest.icons[size]}`, import.meta.url);
    assert.ok(statSync(file).size > 0, `icons/icon-${size}.png is missing or empty`);
  }
});

// The source tree is what both stores get, and each of them rejects a package
// that names its own update service. The self-hosted build adds the two keys
// back, pointed at the constant latest-release assets.
test("the source manifest names no update service, and the self-hosted build adds ours", () => {
  assert.equal(manifest.update_url, undefined);
  assert.equal(manifest.browser_specific_settings.gecko.update_url, undefined);

  const base = "https://github.com/nascosto/PeaceBeStill/releases/latest/download/";
  const selfHosted = selfHostedManifest(manifest, { repo: "nascosto/PeaceBeStill", assets: "peacebestill-youtube" });
  assert.equal(selfHosted.browser_specific_settings.gecko.update_url, base + "peacebestill-youtube-updates.json");
  assert.equal(selfHosted.update_url, base + "peacebestill-youtube-updates.xml");
  assert.equal(selfHosted.browser_specific_settings.gecko.id, "youtube-selfhosted@peacebestill.fyi");
});
