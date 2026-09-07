#!/usr/bin/env node
// Every extension in the repo shares the repo's version, and the release guard
// (check-version.mjs) refuses a tag that disagrees with any of them, so a bump
// means editing package.json and every extensions/*/src/manifest.json in step.
// Doing that by hand is the one part of releasing that quietly goes wrong.
//
//   node scripts/bump.mjs patch      # or minor, major, or an exact 1.2.3
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function nextVersion(current, spec) {
  if (/^\d+\.\d+\.\d+$/.test(spec)) return spec;
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`current version ${current} is not X.Y.Z`);
  const [major, minor, patch] = parts;
  if (spec === "major") return `${major + 1}.0.0`;
  if (spec === "minor") return `${major}.${minor + 1}.0`;
  if (spec === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`${spec} is not major, minor, patch or an exact X.Y.Z version`);
}

// package.json first, then one manifest per extension, in a stable order.
export function versionedFiles(root = ".") {
  const files = ["package.json"];
  for (const entry of readdirSync(`${root}/extensions`, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) files.push(`extensions/${entry.name}/src/manifest.json`);
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const spec = process.argv[2];
  if (!spec) {
    console.error("usage: bump.mjs <major|minor|patch|X.Y.Z>");
    process.exit(2);
  }
  const files = versionedFiles();
  const current = JSON.parse(readFileSync("package.json", "utf8")).version;
  const version = nextVersion(current, spec);
  for (const file of files) {
    const doc = JSON.parse(readFileSync(file, "utf8"));
    doc.version = version;
    writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  }
  console.log(`${current} -> ${version} in ${files.join(", ")}`);
  console.log(`next: git commit -am "Release ${version}" && git tag v${version} && git push origin main v${version}`);
}
