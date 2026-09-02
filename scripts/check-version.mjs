#!/usr/bin/env node
// Release guard: the git tag must be "v" + the manifest version, so a release
// can never carry a package whose own version says something else.
//   node scripts/check-version.mjs v1.0.0
import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? "";
const { version } = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));
if (tag !== `v${version}`) {
  console.error(`tag ${tag || "(none)"} does not match src/manifest.json version ${version} (expected v${version})`);
  process.exit(1);
}
console.log(`tag ${tag} matches manifest version ${version}`);
