// The settings machinery every PeaceBeStill extension shares: defaults, what is
// stored, what is in force, and how one switch covers another. An extension's
// core.js describes its own features and hands them to this; everything below
// is the same for every site.
//
// This file lives in shared/ and is copied into each extension's src/ by
// scripts/sync-shared.mjs, because a store package is the source tree as it
// is and has no build step to reach outside it. test/shared.test.mjs fails if
// any copy differs from this one, so edit it here and run `npm run sync`.
//
// Content scripts cannot be ES modules, so this is a classic script that
// publishes one global, loaded before core.js.
(function (root) {
  // FEATURES: [key, label, default, group, parent?, choices?]. A parent is a
  // switch that hides the thing its children live inside, so while it is on
  // they cannot matter. Choices, when present, make the setting a chooser
  // rather than a switch: [[value, label, needs?], ...].
  // COVERS: [[global, [keys it does the job of]]] -- a switch that does
  // everywhere what per-page switches each do in one place.
  // MIRRORS: [[key, group, parent]] -- a setting also shown a second time,
  // under a switch in another group.
  root.PeaceBeStillSettings = function settingsFor({ FEATURES, COVERS = [], MIRRORS = [] }) {
    const KEYS = FEATURES.map(([key]) => key);
    const featureOf = (key) => FEATURES.find(([featureKey]) => featureKey === key);

    function defaults() {
      return Object.fromEntries(FEATURES.map(([key, , defaultOn]) => [key, defaultOn]));
    }

    // The choices a setting offers, or null when it is an ordinary switch.
    function choicesFor(key) {
      const feature = featureOf(key);
      return (feature && feature[5]) || null;
    }

    // Stored settings over the defaults. A switch takes a boolean and nothing
    // else; a chooser takes one of its own values and nothing else. So a key
    // that is absent, removed (storage.onChanged reports a removal as
    // undefined) or junk falls back to its default. That is what lets us store
    // only what you have actually changed, and lets a later version's new
    // default reach everyone who never touched that setting.
    function withDefaults(settings) {
      const merged = defaults();
      for (const [key, value] of Object.entries(settings || {})) {
        const choices = choicesFor(key);
        if (choices) { if (choices.some(([choice]) => choice === value)) merged[key] = value; }
        else if (typeof value === "boolean") merged[key] = value;
      }
      return merged;
    }

    // The choices still worth offering, given what is switched on. A page you
    // have hidden drops out of the list, and out of what the setting will do.
    function choicesOffered(key, settings) {
      const choices = choicesFor(key);
      if (!choices) return null;
      const merged = withDefaults(settings);
      return choices.filter(([, , needs]) => !needs || merged[needs] !== true);
    }

    // Settings -> the value of the root element's data-peacebestill attribute:
    // the enabled keys, space separated, so hide.css can gate on ~="key".
    function tokensFor(settings) {
      const merged = withDefaults(settings);
      return KEYS.filter((key) => merged[key] === true).join(" ");
    }

    // True when this value is what the feature would do anyway, so storing it
    // would be storing nothing. Unknown keys are never redundant: we do not
    // own them and must not delete them.
    function isDefaultValue(key, value) {
      const all = defaults();
      return Object.prototype.hasOwnProperty.call(all, key) && all[key] === value;
    }

    // The stored keys worth deleting: everything already equal to its default.
    function redundantKeys(stored) {
      return Object.entries(stored || {})
        .filter(([key, value]) => isDefaultValue(key, value))
        .map(([key]) => key);
    }

    // The switch a feature lives inside, or null.
    function parentOf(key) {
      const feature = featureOf(key);
      return (feature && feature[4]) || null;
    }

    // The nearest ancestor of this feature that is switched on: the switch that
    // actually made it moot. With more than one level of nesting the direct
    // parent may itself be off while something above it is on, and naming a
    // switch that is off would be a lie.
    function blockerOf(key, settings) {
      const merged = withDefaults(settings);
      const seen = new Set();
      for (let parent = parentOf(key); parent && !seen.has(parent); parent = parentOf(parent)) {
        if (merged[parent] === true) return parent;
        seen.add(parent);
      }
      return null;
    }

    // True when some ancestor is switched on, i.e. the thing this feature acts
    // on is already hidden, so it cannot have any effect. Its stored value is
    // left alone, so turning the ancestor off brings it back exactly as it was.
    function isMoot(key, settings) {
      return blockerOf(key, settings) !== null;
    }

    // What the content script should actually do, given what is stored: the
    // defaults filled in, and anything an ancestor has made moot put back to
    // its own default -- false for a switch, the default choice for a chooser.
    // Everything downstream reads this and tests each key for truth, so a key
    // that is absent -- every key on a fresh install, since only non-default
    // values are stored -- can never be mistaken for "on".
    function effective(stored) {
      const merged = withDefaults(stored);
      const all = defaults();
      for (const key of KEYS) {
        if (merged[key] && isMoot(key, merged)) merged[key] = all[key];
      }
      return merged;
    }

    function coverOf(key) {
      for (const [global, covered] of COVERS) if (covered.includes(key)) return global;
      return null;
    }

    // The global doing this switch's job for it, or null: on itself, or with
    // something above it already doing its job. Kept apart from isMoot: a
    // switch whose parent has gone is not worth showing at all, while one
    // covered by a global is worth showing as the settled fact it is.
    function coveredBy(key, settings) {
      const global = coverOf(key);
      if (!global) return null;
      const merged = withDefaults(settings);
      return merged[global] === true || isMoot(global, merged) ? global : null;
    }

    // "(3) Some page - Site" -> "Some page - Site": the unread count a site
    // prepends to the tab title.
    function untitled(title) {
      return String(title).replace(/^\(\d+\)\s+/, "");
    }

    return { KEYS, COVERS, MIRRORS, defaults, choicesFor, choicesOffered, withDefaults, tokensFor, isDefaultValue, redundantKeys, parentOf, blockerOf, isMoot, effective, coverOf, coveredBy, untitled };
  };
})(globalThis);
