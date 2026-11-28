export function requireElement<T extends Element>(id: string | null, constructor: { new (): T }): T {
  const element = id === null ? null : document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing or invalid element: ${id}`);
  return element;
}

const elements = {
  "today": requireElement("today", HTMLTimeElement),
  "add": requireElement("add", HTMLButtonElement),
  "storage-error": requireElement("storage-error", HTMLElement),
  "measurements-tab": requireElement("measurements-tab", HTMLButtonElement),
  "cohorts-tab": requireElement("cohorts-tab", HTMLButtonElement),
  "measurements-panel": requireElement("measurements-panel", HTMLElement),
  "latest-sys": requireElement("latest-sys", HTMLElement),
  "latest-dia": requireElement("latest-dia", HTMLElement),
  "latest-pulse": requireElement("latest-pulse", HTMLElement),
  "empty-chart": requireElement("empty-chart", HTMLElement),
  "empty-label": requireElement("empty-label", HTMLElement),
  "charts": requireElement("charts", HTMLElement),
  "bp-chart": requireElement("bp-chart", SVGSVGElement),
  "pulse-chart": requireElement("pulse-chart", SVGSVGElement),
  "selected-reading": requireElement("selected-reading", HTMLElement),
  "previous": requireElement("previous", HTMLButtonElement),
  "next": requireElement("next", HTMLButtonElement),
  "averages": requireElement("averages", HTMLElement),
  "history-count": requireElement("history-count", HTMLElement),
  "history-list": requireElement("history-list", HTMLElement),
  "more": requireElement("more", HTMLButtonElement),
  "cohorts-panel": requireElement("cohorts-panel", HTMLElement),
  "cohort-cards": requireElement("cohort-cards", HTMLElement),
  "export": requireElement("export", HTMLButtonElement),
  "import": requireElement("import", HTMLButtonElement),
  "import-file": requireElement("import-file", HTMLInputElement),
  "measurement-dialog": requireElement("measurement-dialog", HTMLDialogElement),
  "dialog-title": requireElement("dialog-title", HTMLElement),
  "close-dialog": requireElement("close-dialog", HTMLButtonElement),
  "measurement-form": requireElement("measurement-form", HTMLFormElement),
  "systolic": requireElement("systolic", HTMLInputElement),
  "diastolic": requireElement("diastolic", HTMLInputElement),
  "pulse": requireElement("pulse", HTMLInputElement),
  "date": requireElement("date", HTMLInputElement),
  "time": requireElement("time", HTMLInputElement),
  "form-error": requireElement("form-error", HTMLElement),
  "toast": requireElement("toast", HTMLElement),
};

export function element<K extends keyof typeof elements>(id: K): typeof elements[K] {
  return elements[id];
}
