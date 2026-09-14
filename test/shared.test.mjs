import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHARED, extensions } from "../scripts/sync-shared.mjs";

// The two extensions' settings machinery and options pages drifted apart when
// each had its own copy to edit. Now shared/ is the only one to edit, and a
// copy that differs from it -- an edit made in the wrong place -- fails here.
test("every extension carries shared/ exactly, file for file", () => {
  const names = extensions();
  assert.ok(names.length >= 2, `expected extensions, found ${names.join(", ")}`);
  for (const extension of names) {
    for (const file of SHARED) {
      const copy = readFileSync(`extensions/${extension}/src/${file}`, "utf8");
      assert.equal(copy, readFileSync(`shared/${file}`, "utf8"), `extensions/${extension}/src/${file} has drifted from shared/${file}: edit shared/ and run npm run sync`);
    }
  }
});

test("every extension loads the shared settings before its own core, everywhere core is loaded", () => {
  for (const extension of extensions()) {
    const manifest = JSON.parse(readFileSync(`extensions/${extension}/src/manifest.json`, "utf8"));
    const js = manifest.content_scripts[0].js;
    assert.ok(js.indexOf("settings.js") !== -1 && js.indexOf("settings.js") < js.indexOf("core.js"), `${extension} manifest`);
  }
  const html = readFileSync("shared/options.html", "utf8");
  assert.ok(html.indexOf('src="settings.js"') < html.indexOf('src="core.js"'));
  assert.ok(html.indexOf('src="core.js"') < html.indexOf('src="options.js"'));
});

// YouTube's copy of this page once lacked the viewport line, and Firefox for
// Android drew it at desktop width, shrunk until nothing on it could be read or
// tapped. One page now, and this keeps the line on it.
test("the options page is laid out for a phone", () => {
  const html = readFileSync("shared/options.html", "utf8");
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/);
  const css = readFileSync("shared/options.css", "utf8");
  assert.match(css, /@media \(max-width: 480px\)/);
});
