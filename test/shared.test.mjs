import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    assert.deepEqual(js, ["settings.js", "page.js", "core.js", "content.js"], `${extension} manifest`);
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

// Without a toolbar action Firefox greys an extension out in its Extensions
// menu -- there is nothing for a click to do -- which reads as switched off.
// The action opens the options page, so a click anywhere a browser shows the
// extension leads to its settings.
test("every extension's toolbar button opens its options page, with an icon that exists", () => {
  for (const extension of extensions()) {
    const manifest = JSON.parse(readFileSync(`extensions/${extension}/src/manifest.json`, "utf8"));
    assert.equal(manifest.action?.default_popup, "options.html?popup", `${extension}: the button must open the options page`);
    assert.equal(manifest.options_ui?.page, "options.html", `${extension}: the same page the add-ons manager opens`);
    const icons = manifest.action.default_icon ?? {};
    assert.ok(Object.keys(icons).length, `${extension}: the button needs an icon`);
    for (const file of Object.values(icons)) assert.ok(existsSync(`extensions/${extension}/src/${file}`), `${extension}: ${file} is missing`);
  }
});
