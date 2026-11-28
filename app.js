"use strict";
(() => {
  // src/dom.ts
  function requireElement(id, constructor) {
    const element2 = id === null ? null : document.getElementById(id);
    if (!(element2 instanceof constructor)) throw new Error(`Missing or invalid element: ${id}`);
    return element2;
  }
  var elements = {
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
    "toast": requireElement("toast", HTMLElement)
  };
  function element(id) {
    return elements[id];
  }

  // src/model.ts
  var STORAGE_KEY = "vitalcheck.measurements.v1";
  var pad = (value) => String(value).padStart(2, "0");
  var localDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  var localTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  var timestamp = (record) => (/* @__PURE__ */ new Date(`${record.date}T${record.time}:00`)).getTime();
  var sortRecords = (list) => list.sort((a, b) => timestamp(a) - timestamp(b) || a.id.localeCompare(b.id));
  var averageReading = (list, key) => list.length ? Math.round(list.reduce((sum, record) => sum + record[key], 0) / list.length) : null;
  var cohorts = [
    { label: "Rano", start: "06:00", end: "12:00", hours: "06:00–11:59" },
    { label: "Popołudniu", start: "12:00", end: "18:00", hours: "12:00–17:59" },
    { label: "Wieczorem", start: "18:00", end: "22:00", hours: "18:00–21:59" }
  ];
  function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isIntegerInRange(value, max) {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
  }
  function validationError(record) {
    if (!isObject(record)) return "Nieprawidłowy pomiar.";
    if (!isIntegerInRange(record.systolic, 350) || !isIntegerInRange(record.diastolic, 350))
      return "Ciśnienie: wpisz pełne liczby od 1 do 350 mmHg.";
    if (record.systolic <= record.diastolic) return "Ciśnienie skurczowe musi być wyższe niż rozkurczowe.";
    if (!isIntegerInRange(record.pulse, 300))
      return "Puls: wpisz pełną liczbę od 1 do 300 ud./min.";
    if (typeof record.date !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(record.date) || record.date < "1900-01-01" || typeof record.time !== "string" || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(record.time))
      return "Podaj prawidłową datę i godzinę.";
    const date = /* @__PURE__ */ new Date(`${record.date}T${record.time}:00`);
    if (!Number.isFinite(date.getTime()) || localDate(date) !== record.date || localTime(date) !== record.time)
      return "Podaj prawidłową datę i godzinę.";
    return "";
  }
  function hasMeasurementFields(value) {
    return isObject(value) && typeof value.id === "string" && typeof value.systolic === "number" && typeof value.diastolic === "number" && typeof value.pulse === "number" && typeof value.date === "string" && typeof value.time === "string";
  }
  function parseBackup(text) {
    const data = JSON.parse(text);
    if (!isObject(data) || data.version !== 1 || !Array.isArray(data.measurements))
      throw new Error("Nieprawidłowy format kopii VitalCheck.");
    const ids = /* @__PURE__ */ new Set();
    return sortRecords(data.measurements.map((record) => {
      const error = validationError(record);
      if (error || !hasMeasurementFields(record) || !/^[a-zA-Z0-9-]{1,100}$/.test(record.id) || ids.has(record.id))
        throw new Error(error || "Nieprawidłowe lub powtórzone identyfikatory pomiarów.");
      ids.add(record.id);
      return {
        id: record.id,
        systolic: record.systolic,
        diastolic: record.diastolic,
        pulse: record.pulse,
        date: record.date,
        time: record.time
      };
    }));
  }
  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  // src/app.ts
  var shortDate = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });
  var fullDate = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" });
  var axisDate = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" });
  var axisTime = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });
  var records = [];
  var filtered = [];
  var days = "30";
  var selectedId = null;
  var editingId = null;
  var historyLimit = 10;
  var storageReady = false;
  var toastTimer;
  var resizeFrame = 0;
  function selectTab(tab) {
    document.querySelectorAll('[role="tab"]').forEach((button) => {
      const selected = button === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      requireElement(button.getAttribute("aria-controls"), HTMLElement).hidden = !selected;
    });
    renderCharts();
  }
  function renderCohorts() {
    element("cohort-cards").replaceChildren();
    for (const cohort of cohorts) {
      const readings = records.filter((record) => record.time >= cohort.start && record.time < cohort.end);
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
      element("cohort-cards").append(card);
    }
  }
  function readStorage() {
    const text = localStorage.getItem(STORAGE_KEY);
    return text === null ? [] : parseBackup(text);
  }
  function showStorageError(message) {
    element("storage-error").textContent = message;
    element("storage-error").hidden = false;
  }
  function loadStorage() {
    try {
      records = readStorage();
      storageReady = true;
      element("storage-error").hidden = true;
    } catch (error) {
      storageReady = false;
      showStorageError(`Nie można odczytać lokalnych danych. Zapis jest zablokowany, aby ich nie nadpisać. ${errorMessage(error)}`);
    }
    render();
  }
  function persist(update) {
    if (!storageReady) {
      showStorageError("Zapis jest zablokowany. Sprawdź dostęp do danych przeglądarki i otwórz plik ponownie.");
      return false;
    }
    try {
      const next = sortRecords(update(readStorage()));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, measurements: next }));
      records = next;
      element("storage-error").hidden = true;
      render();
      return true;
    } catch (error) {
      showStorageError(`Nie zapisano zmian. ${errorMessage(error)} Sprawdź dostęp i wolne miejsce w pamięci przeglądarki.`);
      return false;
    }
  }
  function toast(message) {
    clearTimeout(toastTimer);
    element("toast").textContent = message;
    element("toast").hidden = false;
    toastTimer = setTimeout(() => {
      element("toast").hidden = true;
    }, 3500);
  }
  function openForm(record = null) {
    element("measurement-form").reset();
    editingId = record ? record.id : null;
    element("dialog-title").textContent = record ? "Edytuj pomiar" : "Nowy pomiar";
    const now = /* @__PURE__ */ new Date();
    element("date").value = record ? record.date : localDate(now);
    element("time").value = record ? record.time : localTime(now);
    for (const field of ["systolic", "diastolic", "pulse"]) element(field).value = record ? String(record[field]) : "";
    element("form-error").hidden = true;
    element("measurement-dialog").showModal();
    element("systolic").focus();
  }
  function render() {
    const now = /* @__PURE__ */ new Date();
    element("today").textContent = fullDate.format(now);
    element("today").dateTime = localDate(now);
    const latest = records[records.length - 1];
    element("latest-sys").textContent = latest ? String(latest.systolic) : "—";
    element("latest-dia").textContent = latest ? String(latest.diastolic) : "—";
    element("latest-pulse").textContent = latest ? String(latest.pulse) : "—";
    document.querySelectorAll(".latest-date").forEach((element2) => {
      element2.textContent = latest ? `${shortDate.format(new Date(timestamp(latest)))} · ${latest.time}` : "Brak pomiarów";
    });
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (days !== "all") start.setDate(start.getDate() - Number(days) + 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    filtered = days === "all" ? records.slice() : records.filter((record) => timestamp(record) >= start.getTime() && timestamp(record) < end.getTime());
    if (!filtered.some((record) => record.id === selectedId)) selectedId = filtered.length ? filtered[filtered.length - 1].id : null;
    element("charts").hidden = filtered.length === 0;
    element("empty-chart").hidden = filtered.length > 0;
    element("empty-label").textContent = records.length ? "Brak pomiarów w tym okresie" : "Dodaj pierwszy pomiar";
    element("export").disabled = !storageReady || records.length === 0;
    element("import").disabled = !storageReady;
    element("add").disabled = !storageReady;
    renderCharts();
    renderHistory();
    renderCohorts();
  }
  function svgElement(tag, attrs = {}, text) {
    const element2 = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) element2.setAttribute(key, String(value));
    if (text !== void 0) element2.textContent = String(text);
    return element2;
  }
  function renderChart(id, series, height) {
    const svg = element(id);
    const width = Math.max(240, svg.getBoundingClientRect().width);
    const left = 35, right = width - 17, top = 14, bottom = height - 30;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.replaceChildren();
    const values = filtered.flatMap((record) => series.map((item) => record[item.key]));
    let min = Infinity, max = -Infinity;
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const step = Math.max(10, Math.ceil((max - min + 10) / 4 / 10) * 10);
    min = Math.max(0, Math.floor((min - 5) / step) * step);
    max = Math.max(min + step * 2, Math.ceil((max + 5) / step) * step);
    const first = timestamp(filtered[0]), last = timestamp(filtered[filtered.length - 1]);
    const x = (time) => first === last ? (left + right) / 2 : left + (time - first) / (last - first) * (right - left);
    const y = (value) => bottom - (value - min) / (max - min) * (bottom - top);
    for (let value = min; value <= max; value += step) {
      svg.append(svgElement("line", { x1: left, x2: right, y1: y(value), y2: y(value), class: "grid" }));
      svg.append(svgElement("text", { x: left - 9, y: y(value) + 4, "text-anchor": "end" }, value));
    }
    const selected = filtered.find((record) => record.id === selectedId);
    if (selected) svg.append(svgElement("line", { x1: x(timestamp(selected)), x2: x(timestamp(selected)), y1: top, y2: bottom, class: "selection" }));
    for (const item of series) {
      svg.append(svgElement("polyline", {
        points: filtered.map((record) => `${x(timestamp(record))},${y(record[item.key])}`).join(" "),
        class: "series",
        stroke: item.color
      }));
      for (const record of filtered) {
        const point = svgElement("circle", {
          cx: x(timestamp(record)),
          cy: y(record[item.key]),
          r: record.id === selectedId ? 5.5 : 3.5,
          fill: item.color,
          class: "point"
        });
        point.append(svgElement("title", {}, `${record.date} ${record.time} · ${item.label}: ${record[item.key]}`));
        svg.append(point);
      }
    }
    const sameDay = filtered[0].date === filtered[filtered.length - 1].date;
    const tickCount = first === last ? 1 : width < 450 ? 3 : 5;
    const usedLabels = /* @__PURE__ */ new Set();
    for (let i = 0; i < tickCount; i++) {
      const time = tickCount === 1 ? first : first + (last - first) * i / (tickCount - 1);
      const label = (sameDay ? axisTime : axisDate).format(new Date(time));
      if (usedLabels.has(label)) continue;
      usedLabels.add(label);
      svg.append(svgElement("text", {
        x: x(time),
        y: height - 7,
        "text-anchor": tickCount === 1 ? "middle" : i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle"
      }, label));
    }
    svg.setAttribute("aria-label", `${id === "bp-chart" ? "Ciśnienie" : "Puls"}: ${filtered.length} pomiarów. ${fullDate.format(new Date(first))} – ${fullDate.format(new Date(last))}. Wartości w historii poniżej.`);
    svg.onclick = (event) => {
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
    if (!filtered.length || element("measurements-panel").hidden) return;
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    renderChart("bp-chart", [
      { key: "systolic", label: "Skurczowe", color: "var(--sys)" },
      { key: "diastolic", label: "Rozkurczowe", color: "var(--dia)" }
    ], mobile ? 205 : 228);
    renderChart("pulse-chart", [{ key: "pulse", label: "Puls", color: "var(--pulse)" }], mobile ? 115 : 125);
    const index = filtered.findIndex((record) => record.id === selectedId);
    const selected = filtered[index];
    element("selected-reading").textContent = `${shortDate.format(new Date(timestamp(selected)))} · ${selected.time} · ${selected.systolic}/${selected.diastolic} mmHg · ${selected.pulse} ud./min`;
    element("previous").disabled = index <= 0;
    element("next").disabled = index >= filtered.length - 1;
    element("averages").replaceChildren();
    const summary = document.createElement("span");
    summary.textContent = `Średnia: ${averageReading(filtered, "systolic")}/${averageReading(filtered, "diastolic")} mmHg · ${averageReading(filtered, "pulse")} ud./min`;
    const count = document.createElement("span");
    count.textContent = `Liczba pomiarów: ${filtered.length}`;
    element("averages").append(summary, count);
  }
  function makeIconButton(icon, label, action, extraClass = "") {
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
    element("history-count").textContent = String(records.length);
    element("history-list").replaceChildren();
    element("more").hidden = records.length <= historyLimit;
    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "no-history";
      empty.textContent = "Brak zapisanych pomiarów";
      element("history-list").append(empty);
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
        if (persist((current) => current.filter((item) => item.id !== record.id))) toast("Usunięto pomiar");
      }, "delete");
      edit.disabled = remove.disabled = !storageReady;
      actions.append(edit, remove);
      row.append(date, pressure, pulse, actions);
      element("history-list").append(row);
    }
  }
  var tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
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
  element("add").addEventListener("click", () => openForm());
  element("close-dialog").addEventListener("click", () => element("measurement-dialog").close());
  element("measurement-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const record = {
      id: editingId || crypto.randomUUID(),
      systolic: Number(element("systolic").value),
      diastolic: Number(element("diastolic").value),
      pulse: Number(element("pulse").value),
      date: element("date").value,
      time: element("time").value
    };
    const error = validationError(record);
    if (error) {
      element("form-error").textContent = error;
      element("form-error").hidden = false;
      return;
    }
    const saved = persist((current) => {
      if (editingId && !current.some((item) => item.id === editingId))
        throw new Error("Ten pomiar został usunięty w innej karcie.");
      return [...current.filter((item) => item.id !== record.id), record];
    });
    if (saved) {
      element("measurement-dialog").close();
      toast(editingId ? "Zapisano zmiany" : "Zapisano pomiar");
    } else {
      element("form-error").textContent = element("storage-error").textContent;
      element("form-error").hidden = false;
    }
  });
  element("systolic").addEventListener("paste", (event) => {
    const match = event.clipboardData?.getData("text").trim().match(/^(\d{1,3})\s*\/\s*(\d{1,3})\s+(\d{1,3})$/);
    if (!match) return;
    event.preventDefault();
    element("systolic").value = match[1];
    element("diastolic").value = match[2];
    element("pulse").value = match[3];
  });
  document.querySelectorAll("[data-days]").forEach((button) => {
    button.addEventListener("click", () => {
      const range = button.dataset.days;
      if (range !== "7" && range !== "30" && range !== "90" && range !== "all")
        throw new Error(`Invalid date range: ${range}`);
      days = range;
      document.querySelectorAll("[data-days]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      render();
    });
  });
  for (const [id, direction] of [["previous", -1], ["next", 1]]) {
    element(id).addEventListener("click", () => {
      const index = filtered.findIndex((record2) => record2.id === selectedId);
      const record = filtered[index + direction];
      if (record) {
        selectedId = record.id;
        renderCharts();
      }
    });
  }
  element("more").addEventListener("click", () => {
    historyLimit += 20;
    renderHistory();
  });
  element("export").addEventListener("click", () => {
    try {
      const current = readStorage();
      const blob = new Blob([JSON.stringify({ version: 1, measurements: current }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `VitalCheck-${localDate(/* @__PURE__ */ new Date())}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1e4);
    } catch (error) {
      showStorageError(`Nie można wyeksportować danych. ${errorMessage(error)}`);
    }
  });
  element("import").addEventListener("click", () => element("import-file").click());
  element("import-file").addEventListener("change", async () => {
    const file = element("import-file").files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Plik jest zbyt duży (maks. 10 MB).");
      const incoming = parseBackup(await file.text());
      if (!incoming.length) throw new Error("Kopia nie zawiera pomiarów.");
      if (!window.confirm(`Importować ${incoming.length} pomiarów? Istniejące dane pozostaną. Identyczne wpisy zostaną pominięte.`)) return;
      let added = 0;
      const signature = (record) => JSON.stringify([record.date, record.time, record.systolic, record.diastolic, record.pulse]);
      const saved = persist((current) => {
        const signatures = new Set(current.map(signature));
        const ids = new Set(current.map((record) => record.id));
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
      element("import-file").value = "";
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) loadStorage();
  });
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderCharts);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadStorage();
  });
  loadStorage();
})();
