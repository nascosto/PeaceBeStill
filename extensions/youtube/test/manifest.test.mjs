import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { selfHostedManifest } from "../../../scripts/variant.mjs";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

const { KEYS } = loadClassic(new URL("../src/core.js", import.meta.url)).PeaceBeStill;

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

// The description is also the store summary, and it counts the switches. A
// switch added without updating it leaves both saying something untrue.
test("the description's switch count is the number of switches", () => {
  const claimed = manifest.description.match(/(\d+) switches/);
  assert.ok(claimed, `description should state a switch count: ${manifest.description}`);
  assert.equal(Number(claimed[1]), KEYS.length);
});

test("manifest asks for nothing beyond storage and youtube.com", () => {
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts.map((c) => c.matches), [["*://www.youtube.com/*", "*://m.youtube.com/*"]]);
  assert.equal(manifest.background, undefined);
});

test("content script loads the core before the script that uses it, at document_start", () => {
  const [cs] = manifest.content_scripts;
  assert.deepEqual(cs.js, ["core.js", "content.js"]);
  assert.deepEqual(cs.css, ["hide.css"]);
  assert.equal(cs.run_at, "document_start");
});

// Firefox for Android needs an explicit opt-in; without gecko_android AMO
// lists the add-on as desktop-only and Android never offers it. The mobile
// site is a separate application (ytm-* components), so the content script has
// to match m.youtube.com as well or it never runs on a phone at all.
test("opts in to Firefox for Android, and runs on the mobile site", () => {
  assert.deepEqual(manifest.browser_specific_settings.gecko_android, { strict_min_version: "142.0" });
  assert.ok(manifest.content_scripts[0].matches.includes("*://m.youtube.com/*"));
});

test("every mobile rule is gated on a real feature key", () => {
  const css = readFileSync(new URL("../src/hide.css", import.meta.url), "utf8");
  const mobile = [...css.matchAll(/html\[data-peacebestill~="([^"]+)"\]\s*([^{]+?)\s*\{/g)]
    .filter((m) => m[2].includes("ytm-"));
  assert.ok(mobile.length >= 12, `expected mobile rules, found ${mobile.length}`);
  for (const [, key] of mobile) assert.ok(KEYS.includes(key), `${key} is not a feature`);
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
