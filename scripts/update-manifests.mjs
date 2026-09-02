#!/usr/bin/env node
// Writes the two update manifests the browsers poll, for one release:
//   node scripts/update-manifests.mjs --repo nascosto/youtube-tidy --tag v1.0.0 --key key.pem --out dist
// Firefox reads updates.json (its ID comes from src/manifest.json); Chromium
// reads updates.xml (its ID is derived from the CRX signing key). Both point at
// that release's own versioned asset URLs, while the browsers fetch the
// manifests themselves from the constant "latest" URLs in the manifest.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { crxId, publicKeyDer } from "./pack-crx.mjs";

export function firefoxUpdates({ id, version, xpiUrl }) {
  return JSON.stringify({ addons: { [id]: { updates: [{ version, update_link: xpiUrl }] } } }, null, 2) + "\n";
}

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/</g, "&lt;");

export function chromiumUpdates({ id, version, crxUrl }) {
  return [
    "<?xml version='1.0' encoding='UTF-8'?>",
    "<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>",
    `  <app appid='${id}'>`,
    `    <updatecheck codebase='${escapeXml(crxUrl)}' version='${version}' />`,
    "  </app>",
    "</gupdate>",
    "",
  ].join("\n");
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = arg("--repo");
  const tag = arg("--tag");
  const keyPath = arg("--key");
  const out = arg("--out");
  if (!repo || !tag || !keyPath || !out) {
    console.error("usage: update-manifests.mjs --repo owner/name --tag vX.Y.Z --key key.pem --out dir");
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));
  const base = `https://github.com/${repo}/releases/download/${tag}/`;
  writeFileSync(`${out}/updates.json`, firefoxUpdates({
    id: manifest.browser_specific_settings.gecko.id,
    version: manifest.version,
    xpiUrl: base + "youtube-tidy.xpi",
  }));
  writeFileSync(`${out}/updates.xml`, chromiumUpdates({
    id: crxId(publicKeyDer(readFileSync(keyPath, "utf8"))),
    version: manifest.version,
    crxUrl: base + "youtube-tidy.crx",
  }));
  console.log(`${out}/updates.json and ${out}/updates.xml for ${tag}`);
}
