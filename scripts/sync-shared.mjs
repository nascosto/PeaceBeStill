#!/usr/bin/env node
// Copies shared/ into every extension's src/. A store package is the source
// tree as it is -- no build step reaches outside it -- so each extension carries
// its own copy of the shared files. test/shared.test.mjs fails if any copy has
// drifted from shared/, which is the one to edit.
//
//   npm run sync
import { copyFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SHARED = ["settings.js", "options.js", "options.html", "options.css"];

export function extensions(root = ".") {
  return readdirSync(`${root}/extensions`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const extension of extensions()) {
    for (const file of SHARED) copyFileSync(`shared/${file}`, `extensions/${extension}/src/${file}`);
    console.log(`extensions/${extension}/src: ${SHARED.join(", ")}`);
  }
}
