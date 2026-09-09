// One checkbox per feature, grouped into a fieldset per section and nested
// under the switch each one depends on, read from and written to storage.sync.
// The content script listens for those writes, so a change shows up in open
// tabs at once.
//
// Nothing here makes a network request, so unlike the YouTube page there is no
// optional data-collection permission to ask for before ticking a box.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { GROUPS, FEATURES, KEYS, defaults, withDefaults, isDefaultValue, redundantKeys, parentOf, isMoot, blockerOf } = globalThis.PeaceBeStill;
  const form = document.getElementById("features");
  const filter = document.getElementById("filter");
  const summary = document.getElementById("summary");
  const status = document.getElementById("status");
  const allOff = document.getElementById("all-off");
  const labelOf = (key) => (FEATURES.find(([featureKey]) => featureKey === key) || [])[1] || key;

  // What storage holds, and what that means with the defaults filled in.
  let stored = {};
  let settings = defaults();
  const rows = [];
  const sections = [];

  function addRow(section, [key, label], indented) {
    const row = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = key;
    const note = document.createElement("span");
    note.className = "why";
    note.id = `why-${key}`;
    box.setAttribute("aria-describedby", note.id);
    row.classList.toggle("child", indented);
    row.append(box, document.createTextNode(" " + label), note);
    section.append(row);
    rows.push({ key, label, box, row, note, section, indented });
  }

  for (const group of GROUPS) {
    const section = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = group;
    section.append(legend);
    form.append(section);
    sections.push(section);

    const inGroup = FEATURES.filter(([, , , featureGroup]) => featureGroup === group);
    const parentIsHere = (feature) => inGroup.some(([key]) => key === feature[4]);
    for (const feature of inGroup) {
      if (parentIsHere(feature)) continue; // rendered under its parent, below
      addRow(section, feature, false);
      for (const child of inGroup.filter(([, , , , parent]) => parent === feature[0])) addRow(section, child, true);
    }
  }

  // A switch whose parent already hides everything it acts on is marked as
  // disabled for assistive technology and refuses changes, but stays in the
  // tab order so it can still be read. Its stored value is left alone, so
  // turning the parent off brings it back exactly as it was.
  function showState() {
    let on = 0;
    for (const { key, box, row, note, indented } of rows) {
      const moot = isMoot(key, settings);
      box.checked = settings[key] === true;
      if (box.checked) on++;
      row.classList.toggle("moot", moot);
      if (moot) box.setAttribute("aria-disabled", "true");
      else box.removeAttribute("aria-disabled");
      // Every locked switch says why, naming the switch that actually locked it
      // -- the nearest ancestor that is on, which with two levels of nesting
      // need not be the direct parent. An indented switch sits directly under
      // its parent, so when that is the one that locked it, pointing at the row
      // above says the same thing without repeating a label three times.
      const blocker = moot ? blockerOf(key, settings) : null;
      note.textContent = !moot ? ""
        : (indented && blocker === parentOf(key)) ? "no effect while the switch above is on"
        : `no effect while “${labelOf(blocker)}” is on`;
    }
    summary.textContent = `${on} of ${rows.length} on · settings follow your browser account`;
  }

  function report(error) {
    status.textContent = `That change could not be saved (${error?.message ?? error}).`;
  }

  // Store only what differs from the default: a switch put back where it
  // started is a key we can delete, and a profile on the defaults stores
  // nothing at all. The content script treats a missing key as its default.
  function save(key, value) {
    status.textContent = "";
    if (isDefaultValue(key, value)) {
      delete stored[key];
      return api.storage.sync.remove(key).catch(report);
    }
    stored[key] = value;
    return api.storage.sync.set({ [key]: value }).catch(report);
  }

  api.storage.sync.get(KEYS).then((values) => {
    stored = { ...values };
    settings = withDefaults(stored);
    showState();
    // Anything stored that only repeats a default is dead weight in a synced
    // store; drop it. Nothing changes on screen, since it was the default.
    const redundant = redundantKeys(stored);
    if (redundant.length) {
      for (const key of redundant) delete stored[key];
      api.storage.sync.remove(redundant).catch(report);
    }
  }).catch(report);

  form.addEventListener("change", async (event) => {
    const box = event.target;
    if (isMoot(box.name, settings)) {
      box.checked = settings[box.name] === true; // locked: put the tick back
      return;
    }
    settings[box.name] = box.checked;
    await save(box.name, box.checked);
    showState();
  });

  allOff.addEventListener("click", async () => {
    const keys = Object.keys(stored);
    stored = {};
    settings = defaults();
    showState();
    if (keys.length) await api.storage.sync.remove(keys).catch(report);
  });

  // Narrow the list to switches whose label matches, and drop a section
  // entirely once nothing in it is left.
  filter.addEventListener("input", () => {
    const query = filter.value.trim().toLowerCase();
    for (const { label, row } of rows) row.hidden = query !== "" && !label.toLowerCase().includes(query);
    for (const section of sections) {
      section.hidden = rows.filter((entry) => entry.section === section).every((entry) => entry.row.hidden);
    }
  });
})();
