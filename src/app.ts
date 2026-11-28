import { element as $, requireElement } from "./dom";
import { STORAGE_KEY, localDate, localTime, timestamp, sortRecords, averageReading, cohorts, validationError, parseBackup, errorMessage, type Measurement, type ReadingKey } from "./model";

const shortDate = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" });
const axisDate = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" });
const axisTime = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });
type DateRange = "7" | "30" | "90" | "all";
type ChartId = "bp-chart" | "pulse-chart";
interface ChartSeries {
  key: ReadingKey;
  label: string;
  color: string;
}

let records: Measurement[] = [];
let filtered: Measurement[] = [];
let days: DateRange = "30";
let selectedId: string | null = null;
let editingId: string | null = null;
let historyLimit = 10;
let storageReady = false;
let toastTimer: number | undefined;
let resizeFrame = 0;

function selectTab(tab: HTMLButtonElement) {
  document.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach(button => {
    const selected = button === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    requireElement(button.getAttribute("aria-controls"), HTMLElement).hidden = !selected;
  });
  renderCharts();
}

function renderCohorts() {
  $("cohort-cards").replaceChildren();
  for (const cohort of cohorts) {
    const readings = records.filter(record => record.time >= cohort.start && record.time < cohort.end);
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent = cohort.label;
    const hours = document.createElement("div");
    hours.className = "card-note";
    hours.textContent = cohort.hours;
    const value = document.createElement("div");
    value.className = "metric";
    value.textContent = readings.length ? `${averageReading(readings, "systolic")}/${averageReading(readings, "diastolic")}` : "—";
    const unit = document.createElement("small");
    unit.textContent = "mmHg";
    value.append(unit);
    const count = document.createElement("div");
    count.className = "card-note";
    count.textContent = readings.length ? `Liczba pomiarów: ${readings.length}` : "Brak pomiarów";
    card.append(title, hours, value, count);
    $("cohort-cards").append(card);
  }
}

function readStorage() {
  const text = localStorage.getItem(STORAGE_KEY);
  return text === null ? [] : parseBackup(text);
}

function showStorageError(message: string) {
  $("storage-error").textContent = message;
  $("storage-error").hidden = false;
}

function loadStorage() {
  try {
    records = readStorage();
    storageReady = true;
    $("storage-error").hidden = true;
  } catch (error) {
    storageReady = false;
    showStorageError(`Nie można odczytać lokalnych danych. Zapis jest zablokowany, aby ich nie nadpisać. ${errorMessage(error)}`);
  }
  render();
}

function persist(update: (current: Measurement[]) => Measurement[]): boolean {
  if (!storageReady) {
    showStorageError("Zapis jest zablokowany. Sprawdź dostęp do danych przeglądarki i otwórz plik ponownie.");
    return false;
  }
  try {
    const next = sortRecords(update(readStorage()));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, measurements: next }));
    records = next;
    $("storage-error").hidden = true;
    render();
    return true;
  } catch (error) {
    showStorageError(`Nie zapisano zmian. ${errorMessage(error)} Sprawdź dostęp i wolne miejsce w pamięci przeglądarki.`);
    return false;
  }
}

function toast(message: string) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3500);
}

function openForm(record: Measurement | null = null) {
  $("measurement-form").reset();
  editingId = record ? record.id : null;
  $("dialog-title").textContent = record ? "Edytuj pomiar" : "Nowy pomiar";
  const now = new Date();
  $("date").value = record ? record.date : localDate(now);
  $("time").value = record ? record.time : localTime(now);
  for (const field of ["systolic", "diastolic", "pulse"] as const) $(field).value = record ? String(record[field]) : "";
  $("form-error").hidden = true;
  $("measurement-dialog").showModal();
  $("systolic").focus();
}

function render() {
  const now = new Date();
  $("today").textContent = fullDate.format(now);
  $("today").dateTime = localDate(now);
  const latest = records[records.length - 1];
  $("latest-sys").textContent = latest ? String(latest.systolic) : "—";
  $("latest-dia").textContent = latest ? String(latest.diastolic) : "—";
  $("latest-pulse").textContent = latest ? String(latest.pulse) : "—";
  document.querySelectorAll(".latest-date").forEach(element => {
    element.textContent = latest ? `${shortDate.format(new Date(timestamp(latest)))} · ${latest.time}` : "Brak pomiarów";
  });
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (days !== "all") start.setDate(start.getDate() - Number(days) + 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  filtered = days === "all" ? records.slice() : records.filter(record => timestamp(record) >= start.getTime() && timestamp(record) < end.getTime());
  if (!filtered.some(record => record.id === selectedId)) selectedId = filtered.length ? filtered[filtered.length - 1].id : null;
  $("charts").hidden = filtered.length === 0;
  $("empty-chart").hidden = filtered.length > 0;
  $("empty-label").textContent = records.length ? "Brak pomiarów w tym okresie" : "Dodaj pierwszy pomiar";
  $("export").disabled = !storageReady || records.length === 0;
  $("import").disabled = !storageReady;
  $("add").disabled = !storageReady;
  renderCharts();
  renderHistory();
  renderCohorts();
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {}, text?: string | number
): SVGElementTagNameMap[K] {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function renderChart(id: ChartId, series: readonly ChartSeries[], height: number) {
  const svg = $(id);
  const width = Math.max(240, svg.getBoundingClientRect().width);
  const left = 35, right = width - 17, top = 14, bottom = height - 30;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const values = filtered.flatMap(record => series.map(item => record[item.key]));
  let min = Infinity, max = -Infinity;
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  const step = Math.max(10, Math.ceil((max - min + 10) / 4 / 10) * 10);
  min = Math.max(0, Math.floor((min - 5) / step) * step);
  max = Math.max(min + step * 2, Math.ceil((max + 5) / step) * step);
  const first = timestamp(filtered[0]), last = timestamp(filtered[filtered.length - 1]);
  const x = (time: number) => first === last ? (left + right) / 2 : left + (time - first) / (last - first) * (right - left);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  for (let value = min; value <= max; value += step) {
    svg.append(svgElement("line", { x1: left, x2: right, y1: y(value), y2: y(value), class: "grid" }));
    svg.append(svgElement("text", { x: left - 9, y: y(value) + 4, "text-anchor": "end" }, value));
  }
  const selected = filtered.find(record => record.id === selectedId);
  if (selected) svg.append(svgElement("line", { x1: x(timestamp(selected)), x2: x(timestamp(selected)), y1: top, y2: bottom, class: "selection" }));
  for (const item of series) {
    svg.append(svgElement("polyline", {
      points: filtered.map(record => `${x(timestamp(record))},${y(record[item.key])}`).join(" "),
      class: "series", stroke: item.color
    }));
    for (const record of filtered) {
      const point = svgElement("circle", { cx: x(timestamp(record)), cy: y(record[item.key]),
        r: record.id === selectedId ? 5.5 : 3.5, fill: item.color, class: "point" });
      point.append(svgElement("title", {}, `${record.date} ${record.time} · ${item.label}: ${record[item.key]}`));
      svg.append(point);
    }
  }
  const sameDay = filtered[0].date === filtered[filtered.length - 1].date;
  const tickCount = first === last ? 1 : width < 450 ? 3 : 5;
  const usedLabels = new Set();
  for (let i = 0; i < tickCount; i++) {
    const time = tickCount === 1 ? first : first + (last - first) * i / (tickCount - 1);
    const label = (sameDay ? axisTime : axisDate).format(new Date(time));
    if (usedLabels.has(label)) continue;
    usedLabels.add(label);
    svg.append(svgElement("text", { x: x(time), y: height - 7,
      "text-anchor": tickCount === 1 ? "middle" : i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle" }, label));
  }
  svg.setAttribute("aria-label", `${id === "bp-chart" ? "Ciśnienie" : "Puls"}: ${filtered.length} pomiarów. ${fullDate.format(new Date(first))} – ${fullDate.format(new Date(last))}. Wartości w historii poniżej.`);
  svg.onclick = event => {
    const bounds = svg.getBoundingClientRect();
    const position = (event.clientX - bounds.left) * width / bounds.width;
    let nearest = filtered[0];
    for (const record of filtered) {
      if (Math.abs(x(timestamp(record)) - position) < Math.abs(x(timestamp(nearest)) - position)) nearest = record;
    }
    selectedId = nearest.id;
    renderCharts();
  };
}

function renderCharts() {
  if (!filtered.length || $("measurements-panel").hidden) return;
  const mobile = window.matchMedia("(max-width: 640px)").matches;
  renderChart("bp-chart", [
    { key: "systolic", label: "Skurczowe", color: "var(--sys)" },
    { key: "diastolic", label: "Rozkurczowe", color: "var(--dia)" }
  ], mobile ? 205 : 228);
  renderChart("pulse-chart", [{ key: "pulse", label: "Puls", color: "var(--pulse)" }], mobile ? 115 : 125);
  const index = filtered.findIndex(record => record.id === selectedId);
  const selected = filtered[index];
  $("selected-reading").textContent = `${shortDate.format(new Date(timestamp(selected)))} · ${selected.time} · ${selected.systolic}/${selected.diastolic} mmHg · ${selected.pulse} ud./min`;
  $("previous").disabled = index <= 0;
  $("next").disabled = index >= filtered.length - 1;
  $("averages").replaceChildren();
  const summary = document.createElement("span");
  summary.textContent = `Średnia: ${averageReading(filtered, "systolic")}/${averageReading(filtered, "diastolic")} mmHg · ${averageReading(filtered, "pulse")} ud./min`;
  const count = document.createElement("span");
  count.textContent = `Liczba pomiarów: ${filtered.length}`;
  $("averages").append(summary, count);
}

function makeIconButton(icon: string, label: string, action: () => void, extraClass = "") {
  const button = document.createElement("button");
  button.className = `icon-button ${extraClass}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  const svg = svgElement("svg", { class: "icon", "aria-hidden": "true" });
  svg.append(svgElement("use", { href: `#i-${icon}` }));
  button.append(svg);
  button.addEventListener("click", action);
  return button;
}

function renderHistory() {
  $("history-count").textContent = String(records.length);
  $("history-list").replaceChildren();
  $("more").hidden = records.length <= historyLimit;
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "no-history";
    empty.textContent = "Brak zapisanych pomiarów";
    $("history-list").append(empty);
    return;
  }
  for (const record of records.slice().reverse().slice(0, historyLimit)) {
    const row = document.createElement("article");
    row.className = "history-row";
    const date = document.createElement("div");
    const day = document.createElement("div");
    day.className = "reading-date";
    day.textContent = fullDate.format(new Date(timestamp(record)));
    const time = document.createElement("div");
    time.className = "reading-time";
    time.textContent = record.time;
    date.append(day, time);
    const pressure = document.createElement("div");
    pressure.className = "reading-value";
    pressure.textContent = `${record.systolic}/${record.diastolic}`;
    const pressureUnit = document.createElement("small");
    pressureUnit.textContent = "mmHg";
    pressure.append(pressureUnit);
    const pulse = document.createElement("div");
    pulse.className = "reading-value reading-pulse";
    pulse.textContent = String(record.pulse);
    const pulseUnit = document.createElement("small");
    pulseUnit.textContent = "ud./min";
    pulse.append(pulseUnit);
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const label = `${record.date}, ${record.time}`;
    const edit = makeIconButton("edit", `Edytuj pomiar: ${label}`, () => openForm(record));
    const remove = makeIconButton("trash", `Usuń pomiar: ${label}`, () => {
      if (!window.confirm(`Usunąć pomiar ${record.systolic}/${record.diastolic}, ${record.pulse} ud./min z ${record.date}, ${record.time}?`)) return;
      if (persist(current => current.filter(item => item.id !== record.id))) toast("Usunięto pomiar");
    }, "delete");
    edit.disabled = remove.disabled = !storageReady;
    actions.append(edit, remove);
    row.append(date, pressure, pulse, actions);
    $("history-list").append(row);
  }
}

const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", event => {
    let next;
    if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
    else if (event.key === "ArrowLeft") next = tabs[(index + tabs.length - 1) % tabs.length];
    else if (event.key === "Home") next = tabs[0];
    else if (event.key === "End") next = tabs[tabs.length - 1];
    else return;
    event.preventDefault();
    selectTab(next);
    next.focus();
  });
});
$("add").addEventListener("click", () => openForm());
$("close-dialog").addEventListener("click", () => $("measurement-dialog").close());
$("measurement-form").addEventListener("submit", event => {
  event.preventDefault();
  const record: Measurement = { id: editingId || crypto.randomUUID(), systolic: Number($("systolic").value),
    diastolic: Number($("diastolic").value), pulse: Number($("pulse").value),
    date: $("date").value, time: $("time").value };
  const error = validationError(record);
  if (error) {
    $("form-error").textContent = error;
    $("form-error").hidden = false;
    return;
  }
  const saved = persist(current => {
    if (editingId && !current.some(item => item.id === editingId))
      throw new Error("Ten pomiar został usunięty w innej karcie.");
    return [...current.filter(item => item.id !== record.id), record];
  });
  if (saved) {
    $("measurement-dialog").close();
    toast(editingId ? "Zapisano zmiany" : "Zapisano pomiar");
  } else {
    $("form-error").textContent = $("storage-error").textContent;
    $("form-error").hidden = false;
  }
});
$("systolic").addEventListener("paste", event => {
  const match = event.clipboardData?.getData("text").trim().match(/^(\d{1,3})\s*\/\s*(\d{1,3})\s+(\d{1,3})$/);
  if (!match) return;
  event.preventDefault();
  $("systolic").value = match[1];
  $("diastolic").value = match[2];
  $("pulse").value = match[3];
});
document.querySelectorAll<HTMLButtonElement>("[data-days]").forEach(button => {
  button.addEventListener("click", () => {
    const range = button.dataset.days;
    if (range !== "7" && range !== "30" && range !== "90" && range !== "all")
      throw new Error(`Invalid date range: ${range}`);
    days = range;
    document.querySelectorAll("[data-days]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    render();
  });
});
for (const [id, direction] of [["previous", -1], ["next", 1]] as const) {
  $(id).addEventListener("click", () => {
    const index = filtered.findIndex(record => record.id === selectedId);
    const record = filtered[index + direction];
    if (record) { selectedId = record.id; renderCharts(); }
  });
}
$("more").addEventListener("click", () => { historyLimit += 20; renderHistory(); });
$("export").addEventListener("click", () => {
  try {
    const current = readStorage();
    const blob = new Blob([JSON.stringify({ version: 1, measurements: current }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `VitalCheck-${localDate(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) {
    showStorageError(`Nie można wyeksportować danych. ${errorMessage(error)}`);
  }
});
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async () => {
  const file = $("import-file").files?.[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("Plik jest zbyt duży (maks. 10 MB).");
    const incoming = parseBackup(await file.text());
    if (!incoming.length) throw new Error("Kopia nie zawiera pomiarów.");
    if (!window.confirm(`Importować ${incoming.length} pomiarów? Istniejące dane pozostaną. Identyczne wpisy zostaną pominięte.`)) return;
    let added = 0;
    const signature = (record: Measurement) => JSON.stringify([record.date, record.time, record.systolic, record.diastolic, record.pulse]);
    const saved = persist(current => {
      const signatures = new Set(current.map(signature));
      const ids = new Set(current.map(record => record.id));
      for (const record of incoming) {
        if (signatures.has(signature(record))) continue;
        const copy = { ...record, id: ids.has(record.id) ? crypto.randomUUID() : record.id };
        current.push(copy);
        signatures.add(signature(copy));
        ids.add(copy.id);
        added++;
      }
      return current;
    });
    if (saved) toast(added ? `Dodano pomiary: ${added}` : "Te pomiary są już zapisane");
  } catch (error) {
    showStorageError(`Nie zaimportowano danych. ${errorMessage(error)}`);
  } finally {
    $("import-file").value = "";
  }
});
window.addEventListener("storage", event => { if (event.key === STORAGE_KEY || event.key === null) loadStorage(); });
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(renderCharts);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadStorage();
});
loadStorage();
