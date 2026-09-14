import { readFileSync } from "node:fs";
import vm from "node:vm";

// Runs a classic (non-module) script in a fresh context and returns that
// context, so tests can read the globals the script published. Takes a URL,
// usually new URL("../src/core.js", import.meta.url).
export function loadClassic(url, extraGlobals = {}) {
  const src = readFileSync(url, "utf8");
  const context = vm.createContext({ URLSearchParams, ...extraGlobals });
  context.globalThis = context;
  vm.runInContext(src, context, { filename: String(url) });
  return context;
}

// An extension's core: shared/settings.js as that extension carries it, then
// its own core.js, in one context -- the order the manifest and the options
// page load them in. Takes the extension's src directory as a URL, usually
// new URL("../src/", import.meta.url).
export function loadCore(srcDir, extraGlobals = {}) {
  const context = loadClassic(new URL("settings.js", srcDir), extraGlobals);
  vm.runInContext(readFileSync(new URL("core.js", srcDir), "utf8"), context, { filename: String(new URL("core.js", srcDir)) });
  return context;
}

// An extension's content script, as the manifest loads it: shared/page.js as
// the extension carries it, then content.js, in one context with the fake page
// the test hands in. Takes the extension's src directory as a URL.
export function loadContent(srcDir, extraGlobals = {}) {
  const context = loadClassic(new URL("page.js", srcDir), extraGlobals);
  vm.runInContext(readFileSync(new URL("content.js", srcDir), "utf8"), context, { filename: String(new URL("content.js", srcDir)) });
  return context;
}
