// One checkbox per feature, grouped into a fieldset per section and nested
// under the switch each one depends on, read from and written to storage.sync.
// The content script listens for those writes, so a change shows up in open
// tabs at once.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { GROUPS, FEATURES, KEYS, defaults, withDefaults, isDefaultValue, redundantKeys, parentOf, isMoot } = globalThis.PeaceBeStill;
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
      // Every locked switch says why. An indented one sits directly under the
      // switch that locked it, so naming it again for each of three siblings
      // is just noise; one that was pushed into another section by its own
      // subject matter has to name it.
      note.textContent = !moot ? ""
        : indented ? "no effect while the switch above is on"
        : `no effect while “${labelOf(parentOf(key))}” is on`;
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

  // The dislike count sends the video ID to a third party, which Firefox tracks
  // as an optional data-collection permission: ask for it on the way in, and
  // take the tick back if it is refused. Chromium has no such permission and
  // rejects the request, which is not a refusal, so treat a throw as consent
  // already given.
  async function consentFor(box) {
    if (box.name !== "dislikeCount" || !box.checked) return true;
    if (!api.permissions?.request) return true;
    try {
      return await api.permissions.request({ data_collection: ["browsingActivity"] });
    } catch {
      return true;
    }
  }

  form.addEventListener("change", async (event) => {
    const box = event.target;
    if (isMoot(box.name, settings)) {
      box.checked = settings[box.name] === true; // locked: put the tick back
      return;
    }
    if (!(await consentFor(box))) {
      box.checked = false;
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
