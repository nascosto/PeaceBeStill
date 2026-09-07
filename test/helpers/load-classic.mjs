import { readFileSync } from "node:fs";
import vm from "node:vm";

// Runs a classic (non-module) script in a fresh context and returns that
// context, so tests can read the globals the script published. Takes a URL,
// usually new URL("../src/core.js", import.meta.url).
export function loadClassic(url, extraGlobals = {}) {
  const src = readFileSync(url, "utf8");
  const context = { URLSearchParams, ...extraGlobals };
  context.globalThis = context;
  vm.runInNewContext(src, context, { filename: String(url) });
  return context;
}
