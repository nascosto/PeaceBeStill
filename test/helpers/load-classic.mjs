import { readFileSync } from "node:fs";
import vm from "node:vm";

// Runs a classic (non-module) script from the repo in a fresh context and
// returns that context, so tests can read the globals the script published.
export function loadClassic(relativePath, extraGlobals = {}) {
  const src = readFileSync(new URL("../../" + relativePath, import.meta.url), "utf8");
  const context = { URLSearchParams, ...extraGlobals };
  context.globalThis = context;
  vm.runInNewContext(src, context, { filename: relativePath });
  return context;
}
