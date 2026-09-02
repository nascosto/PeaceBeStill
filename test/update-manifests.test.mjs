import test from "node:test";
import assert from "node:assert/strict";
import { firefoxUpdates, chromiumUpdates } from "../scripts/update-manifests.mjs";

test("Firefox update manifest has the addon, version and versioned link", () => {
  const text = firefoxUpdates({ id: "youtube-tidy@peacebestill.fyi", version: "1.2.3", xpiUrl: "https://example.test/releases/download/v1.2.3/youtube-tidy.xpi" });
  assert.deepEqual(JSON.parse(text), {
    addons: { "youtube-tidy@peacebestill.fyi": { updates: [{ version: "1.2.3", update_link: "https://example.test/releases/download/v1.2.3/youtube-tidy.xpi" }] } },
  });
  assert.ok(text.endsWith("\n"));
});

test("Chromium update manifest is a gupdate document with the app, codebase and version", () => {
  const xml = chromiumUpdates({ id: "a".repeat(32), version: "1.2.3", crxUrl: "https://example.test/releases/download/v1.2.3/youtube-tidy.crx?a=1&b=2" });
  assert.match(xml, /^<\?xml version='1\.0' encoding='UTF-8'\?>\n<gupdate xmlns='http:\/\/www\.google\.com\/update2\/response' protocol='2\.0'>/);
  assert.match(xml, new RegExp(`<app appid='${"a".repeat(32)}'>`));
  assert.match(xml, /codebase='https:\/\/example\.test\/releases\/download\/v1\.2\.3\/youtube-tidy\.crx\?a=1&amp;b=2'/);
  assert.match(xml, /version='1\.2\.3'/);
});
