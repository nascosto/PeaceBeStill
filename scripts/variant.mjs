#!/usr/bin/env node
// The source tree is the build the two stores get: no update_url anywhere,
// because both stores reject a package that names its own update service, and
// they are the update authority for anything they carry.
//
// The self-hosted build is that same tree with a rewritten manifest, produced
// here:
//
//   node scripts/variant.mjs --src extensions/youtube/src --out dist/self-hosted/youtube \
//     --assets peacebestill-youtube [--repo nascosto/PeaceBeStill]
//
// It adds back the two update_url keys, pointed at the release's own constant
// asset URLs, and gives Firefox a separate add-on ID. The ID has to differ
// because AMO holds one version number once per add-on across both its listed
// and unlisted channels, so a release that publishes 1.2.3 to the store and
// self-hosts 1.2.3 would collide on the second upload. Chromium needs no such
// split: the store assigns its own ID there, and the self-hosted ID comes from
// the CRX signing key rather than the manifest.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_REPO = "nascosto/PeaceBeStill";

// bare@domain -> bare-selfhosted@domain, so the two are recognisably a pair.
export function selfHostedId(id) {
  const at = id.lastIndexOf("@");
  if (at === -1) throw new Error(`add-on ID ${id} is not local@domain`);
  return `${id.slice(0, at)}-selfhosted${id.slice(at)}`;
}

export function selfHostedManifest(manifest, { repo = DEFAULT_REPO, assets }) {
  if (!assets) throw new Error("selfHostedManifest needs the release's asset prefix");
  const base = `https://github.com/${repo}/releases/latest/download/${assets}`;
  const settings = manifest.browser_specific_settings ?? {};
  const gecko = settings.gecko;
  if (!gecko?.id) throw new Error("manifest has no browser_specific_settings.gecko.id");
  return {
    ...manifest,
    browser_specific_settings: {
      ...settings,
      gecko: { ...gecko, id: selfHostedId(gecko.id), update_url: `${base}-updates.json` },
    },
    update_url: `${base}-updates.xml`,
  };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = arg("--src");
  const out = arg("--out");
  const assets = arg("--assets");
  const repo = arg("--repo") ?? process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO;
  if (!src || !out || !assets) {
    console.error("usage: variant.mjs --src dir --out dir --assets base-name [--repo owner/name]");
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(`${src}/manifest.json`, "utf8"));
  const rewritten = selfHostedManifest(manifest, { repo, assets });
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(src, out, { recursive: true });
  writeFileSync(`${out}/manifest.json`, JSON.stringify(rewritten, null, 2) + "\n");
  console.log(`${out} (id ${rewritten.browser_specific_settings.gecko.id})`);
}
