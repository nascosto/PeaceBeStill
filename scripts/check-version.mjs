#!/usr/bin/env node
// Release guard: the git tag must be "v" + the version of package.json and of
// every extension's manifest, so a release can never carry a package whose own
// version says something else. Every extension in the repo shares one version.
//
//   node scripts/check-version.mjs v1.0.0 extensions/youtube/src [more...]
import { readFileSync } from "node:fs";

const [, , tag = "", ...sources] = process.argv;
if (!sources.length) {
  console.error("usage: check-version.mjs <tag> <extension src dir>...");
  process.exit(2);
}
if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(`tag ${tag || "(none)"} is not of the form vX.Y.Z`);
  process.exit(1);
}
const want = tag.slice(1);
const checked = [["package.json", JSON.parse(readFileSync("package.json", "utf8"))]];
for (const src of sources) checked.push([`${src}/manifest.json`, JSON.parse(readFileSync(`${src}/manifest.json`, "utf8"))]);

const wrong = checked.filter(([, doc]) => doc.version !== want);
if (wrong.length) {
  for (const [where, doc] of wrong) console.error(`${where} is version ${doc.version}, but tag ${tag} expects ${want}`);
  process.exit(1);
}
console.log(`tag ${tag} matches ${checked.map(([where]) => where).join(", ")}`);
