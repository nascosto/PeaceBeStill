// One checkbox per feature, grouped under section headings and nested under
// the switch each one depends on, read from and written to storage.sync. The
// content script listens for those writes, so a change shows up in open tabs
// at once.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { GROUPS, FEATURES, KEYS, defaults, withDefaults, isDefaultValue, redundantKeys, parentOf, isMoot } = globalThis.YtTidy;
  const form = document.getElementById("features");
  const labelOf = (key) => (FEATURES.find(([featureKey]) => featureKey === key) || [])[1] || key;

  let settings = defaults();
  const rows = [];

  function addRow([key, label], indented) {
    const row = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = key;
    // Named only when the parent is not the switch directly above, i.e. when
    // it lives in another section and the greying would otherwise be a puzzle.
    const note = document.createElement("span");
    note.className = "why";
    row.classList.toggle("child", indented);
    row.append(box, document.createTextNode(" " + label), note);
    form.append(row);
    rows.push({ key, box, row, note, indented });
  }

  for (const group of GROUPS) {
    const heading = document.createElement("h2");
    heading.textContent = group;
    form.append(heading);

    const inGroup = FEATURES.filter(([, , , featureGroup]) => featureGroup === group);
    const parentIsHere = (feature) => inGroup.some(([key]) => key === feature[4]);
    for (const feature of inGroup) {
      if (parentIsHere(feature)) continue; // rendered under its parent, below
      addRow(feature, false);
      for (const child of inGroup.filter(([, , , , parent]) => parent === feature[0])) addRow(child, true);
    }
  }

  // A switch whose parent already hides everything it acts on is greyed out
  // and locked. Its stored value is left alone, so turning the parent off
  // brings it back exactly as it was.
  function showState() {
    for (const { key, box, row, note, indented } of rows) {
      const moot = isMoot(key, settings);
      box.checked = settings[key] === true;
      box.disabled = moot;
      row.classList.toggle("moot", moot);
      note.textContent = moot && !indented ? ` — no effect while “${labelOf(parentOf(key))}” is on` : "";
    }
  }

  api.storage.sync.get(KEYS).then((stored) => {
    settings = withDefaults(stored);
    showState();
    // Anything stored that only repeats a default is dead weight in a synced
    // store; drop it. Nothing changes on screen, since it was the default.
    const redundant = redundantKeys(stored);
    if (redundant.length) api.storage.sync.remove(redundant);
  });

  // The dislike count sends the video ID to a third party, which Firefox tracks
  // as an optional data-collection permission: ask for it on the way in, and
  // take the tick back if it is refused. Chromium has no such API; skip it.
  async function consentFor(box) {
    if (box.name !== "dislikeCount" || !box.checked) return true;
    if (!api.permissions?.request) return true;
    return api.permissions.request({ data_collection: ["browsingActivity"] });
  }

  form.addEventListener("change", async (event) => {
    const box = event.target;
    if (!(await consentFor(box))) {
      box.checked = false;
      return;
    }
    settings[box.name] = box.checked;
    // Store only what differs from the default: a switch put back where it
    // started is a key we can delete, and a profile on the defaults stores
    // nothing at all. tokensFor treats a missing key as its default.
    if (isDefaultValue(box.name, box.checked)) api.storage.sync.remove(box.name);
    else api.storage.sync.set({ [box.name]: box.checked });
    showState();
  });
})();
