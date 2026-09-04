// One checkbox per feature, grouped under section headings, read from and
// written to storage.sync. The content script listens for those writes, so a
// change shows up in open tabs at once.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  const { GROUPS, FEATURES, KEYS, defaults } = globalThis.YtTidy;
  const form = document.getElementById("features");

  for (const group of GROUPS) {
    const heading = document.createElement("h2");
    heading.textContent = group;
    form.append(heading);
    for (const [key, label, , featureGroup] of FEATURES) {
      if (featureGroup !== group) continue;
      const row = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.name = key;
      row.append(box, document.createTextNode(" " + label));
      form.append(row);
    }
  }

  api.storage.sync.get(KEYS).then((stored) => {
    const settings = { ...defaults(), ...stored };
    for (const box of form.elements) box.checked = settings[box.name] === true;
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
    api.storage.sync.set({ [box.name]: box.checked });
  });
})();
