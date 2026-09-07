#!/usr/bin/env node
// Writes the two update manifests the browsers poll, for one release:
//   node scripts/update-manifests.mjs --repo nascosto/PeaceBeStill --tag v1.0.0 \
//     --key key.pem --src extensions/youtube/src --assets peacebestill-youtube --out dist
// Firefox reads the .json (its ID comes from the extension's manifest);
// Chromium reads the .xml (its ID is derived from the CRX signing key). Both
// point at that release's own versioned asset URLs, while the browsers fetch
// the manifests themselves from the constant "latest" URLs in the manifest.
// Assets are prefixed per extension, so one release can carry several.
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
  const src = arg("--src");
  const assets = arg("--assets");
  const out = arg("--out");
  if (!repo || !tag || !keyPath || !src || !assets || !out) {
    console.error("usage: update-manifests.mjs --repo owner/name --tag vX.Y.Z --key key.pem --src dir --assets base-name --out dir");
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(`${src}/manifest.json`, "utf8"));
  const base = `https://github.com/${repo}/releases/download/${tag}/`;
  writeFileSync(`${out}/${assets}-updates.json`, firefoxUpdates({
    id: manifest.browser_specific_settings.gecko.id,
    version: manifest.version,
    xpiUrl: `${base}${assets}.xpi`,
  }));
  writeFileSync(`${out}/${assets}-updates.xml`, chromiumUpdates({
    id: crxId(publicKeyDer(readFileSync(keyPath, "utf8"))),
    version: manifest.version,
    crxUrl: `${base}${assets}.crx`,
  }));
  console.log(`${out}/${assets}-updates.json and ${out}/${assets}-updates.xml for ${tag}`);
}
