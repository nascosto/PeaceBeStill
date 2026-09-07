#!/usr/bin/env node
// Release guard: the git tag must be "v" + an extension's manifest version,
// so a release can never carry a package whose own version says something else.
// Every extension in the repo shares the repo's version.
//   node scripts/check-version.mjs v1.0.0 extensions/youtube/src
import { readFileSync } from "node:fs";

// node scripts/check-version.mjs v1.0.0 extensions/youtube/src
const [, , tag = "", src] = process.argv;
if (!src) {
  console.error("usage: check-version.mjs <tag> <extension src dir>");
  process.exit(2);
}
const { version, name } = JSON.parse(readFileSync(`${src}/manifest.json`, "utf8"));
if (tag !== `v${version}`) {
  console.error(`tag ${tag || "(none)"} does not match ${name} version ${version} (expected v${version})`);
  process.exit(1);
}
console.log(`tag ${tag} matches ${name} version ${version}`);
