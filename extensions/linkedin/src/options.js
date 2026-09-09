// One checkbox per feature, grouped into a fieldset per section and nested
// under the switch each one depends on, read from and written to storage.sync.
// The content script listens for those writes, so a change shows up in open
// tabs at once.
//
// Nothing here makes a network request, so unlike the YouTube page there is no
// optional data-collection permission to ask for before ticking a box.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { GROUPS, FEATURES, KEYS, defaults, withDefaults, isDefaultValue, redundantKeys, parentOf, isMoot, choicesFor, choicesOffered } = globalThis.PeaceBeStill;
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

  // How deep a switch sits: blackout's children are one level in, theirs two.
  // The indent shows the nesting even when parent and child are filed under
  // different headings, which is how "Hide everything" parents the whole page.
  function depthOf(key) {
    let depth = 0;
    const seen = new Set();
    for (let parent = parentOf(key); parent && !seen.has(parent); parent = parentOf(parent)) {
      seen.add(parent);
      depth++;
    }
    return depth;
  }

  function addRow(section, [key, label]) {
    const row = document.createElement("label");
    const choices = choicesFor(key);
    // Most settings are a switch. One -- where the home page goes instead --
    // is a choice between places, which is a list, not a tick.
    const box = document.createElement(choices ? "select" : "input");
    if (!choices) box.type = "checkbox";
    box.name = key;
    // One indent per level, however deep: with a cap at two, a switch inside
    // the feed inside Home sat level with the feed itself and read as its
    // sibling. Four is as deep as the tree goes.
    const depth = depthOf(key);
    if (depth) row.setAttribute("data-depth", String(Math.min(depth, 4)));
    row.append(box, document.createTextNode(" " + label));
    section.append(row);
    rows.push({ key, label, box, row, section, depth, choices });
  }

  for (const group of GROUPS) {
    const section = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = group;
    section.append(legend);
    form.append(section);
    sections.push(section);

    // Depth-first, so a switch is followed by everything it covers, however
    // many levels deep. Rendering only one level -- which this did before --
    // dropped a grandchild filed under the same heading entirely.
    const inGroup = FEATURES.filter(([, , , featureGroup]) => featureGroup === group);
    const parentIsHere = (feature) => inGroup.some(([key]) => key === feature[4]);
    const addBranch = (feature) => {
      addRow(section, feature);
      for (const child of inGroup.filter(([, , , , parent]) => parent === feature[0])) addBranch(child);
    };
    for (const feature of inGroup) if (!parentIsHere(feature)) addBranch(feature);
  }

  // A switch an ancestor has already covered is taken off the list rather than
  // greyed out with an explanation: while the thing it acts on is gone there is
  // nothing to decide about it. Its stored value is untouched, so turning the
  // ancestor off brings it back exactly as it was. The filter narrows the same
  // list, and a section with nothing left to show goes too.
  function showState() {
    const query = filter.value.trim().toLowerCase();
    let on = 0;
    let covered = 0;
    for (const { key, label, box, row, choices } of rows) {
      if (choices) {
        // Rebuilt every time, because hiding a page takes it out of the list.
        const offered = choicesOffered(key, settings);
        box.children.length = 0;
        for (const [value, text] of offered) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = text;
          box.append(option);
        }
        const chosen = settings[key] ?? "";
        box.value = offered.some(([value]) => value === chosen) ? chosen : "";
      } else {
        box.checked = settings[key] === true;
      }
      // A chooser counts as on when it has been moved off its default.
      if (choices ? !isDefaultValue(key, settings[key]) : box.checked) on++;
      const moot = isMoot(key, settings);
      if (moot) covered++;
      row.hidden = moot || (query !== "" && !label.toLowerCase().includes(query));
    }
    for (const section of sections) {
      section.hidden = rows.filter((entry) => entry.section === section).every((entry) => entry.row.hidden);
    }
    const note = covered ? ` · ${covered} covered by a switch above` : "";
    summary.textContent = `${on} of ${rows.length} on${note} · settings follow your browser account`;
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
      // Covered by a switch above, so it is not on screen to be clicked; put
      // whatever it was back and ignore this.
      if (box.type === "checkbox") box.checked = settings[box.name] === true;
      else box.value = settings[box.name] ?? "";
      return;
    }
    const value = box.type === "checkbox" ? box.checked : box.value;
    settings[box.name] = value;
    await save(box.name, value);
    showState();
  });

  allOff.addEventListener("click", async () => {
    const keys = Object.keys(stored);
    stored = {};
    settings = defaults();
    showState();
    if (keys.length) await api.storage.sync.remove(keys).catch(report);
  });

  // The filter narrows the same list showState draws.
  filter.addEventListener("input", showState);
})();
