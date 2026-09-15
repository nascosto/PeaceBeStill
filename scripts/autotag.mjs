#!/usr/bin/env node
// Whether this push to main is a release. Main carries one version, in
// package.json and every manifest (check-version.mjs holds them together).
// The first push that carries a version with no tag releases it, and tags it
// on the way; every push after that finds the tag and does nothing. So a
// release is a merged version bump, and nothing else.
//
// The version must be newer than every version tag. AMO takes a version
// number once per add-on, even after that version is deleted, so anything
// else -- a bump the wrong way, a number already used -- fails here instead of
// failing at the store halfway through a release.
//
//   node scripts/autotag.mjs      # reads package.json and git's v* tags;
//                                 # writes release= and tag= to $GITHUB_OUTPUT
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

function parts(version) {
  const match = VERSION.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function newer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function decide(version, tags) {
  const mine = parts(version);
  if (!mine) throw new Error(`package.json version ${version} is not of the form X.Y.Z`);
  const tag = `v${version}`;
  if (tags.includes(tag)) return { release: false, tag, reason: `${tag} is already tagged, so there is nothing new to release` };
  const released = tags.map((name) => [name, parts(name.slice(1))]).filter(([name, p]) => name.startsWith("v") && p);
  for (const [name, p] of released) {
    if (!newer(mine, p)) {
      const newest = released.reduce((best, entry) => (newer(entry[1], best[1]) ? entry : best));
      throw new Error(`${version} is not newer than ${newest[0]}: bump to a version above every release (AMO takes each number once)`);
    }
  }
  return { release: true, tag };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" }).split("\n").filter(Boolean);
  let answer;
  try {
    answer = decide(version, tags);
  } catch (error) {
    console.log(`::error::${error.message}`);
    process.exit(1);
  }
  console.log(answer.release ? `Releasing ${answer.tag}.` : `${answer.reason}.`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `release=${answer.release}\ntag=${answer.tag}\n`);
}
