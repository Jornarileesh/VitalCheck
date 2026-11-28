const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const appUrl = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
const storageKey = "vitalcheck.measurements.v1";
const fixedTime = new Date("2026-11-28T15:30:00Z");
let browser;

before(async () => {
  browser = await chromium.launch({
    channel: process.env.VITALCHECK_BROWSER || "chromium",
    headless: true
  });
});
after(async () => { await browser?.close(); });

function measurement(id, time, systolic, diastolic, date = "2026-11-28") {
  return { id, date, time, systolic, diastolic, pulse: 69 };
}

const samples = [
  measurement("early", "05:59", 300, 200),
  measurement("morning", "06:00", 120, 80),
  measurement("late-morning", "11:59", 131, 85),
  measurement("afternoon", "12:00", 140, 90),
  measurement("late-afternoon", "17:59", 150, 96),
  measurement("evening", "18:00", 110, 70),
  measurement("late-evening", "21:59", 120, 80),
  measurement("night", "22:00", 300, 200),
  measurement("old", "08:00", 140, 90, "2020-01-01")
];

async function openPage(t, url = appUrl) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, timezoneId: "Europe/Warsaw"
  });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], "No unhandled browser errors");
    assert.deepEqual(requests, [], "No network dependencies");
  });
  await page.clock.install({ time: fixedTime });
  await page.goto(url);
  return page;
}

async function seed(page, measurements) {
  await page.evaluate(({ storageKey, measurements }) => {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, measurements }));
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
  }, { storageKey, measurements });
}

async function submit(page, { systolic = "120", diastolic = "80", pulse = "69", time = "08:30" } = {}) {
  await page.locator("#systolic").fill(systolic);
  await page.locator("#diastolic").fill(diastolic);
  await page.locator("#pulse").fill(pulse);
  await page.locator("#time").fill(time);
  await page.locator(".save").click();
}

test("existing data, cohorts, chart filters and tab keyboard navigation", async t => {
  const page = await openPage(t);
  assert.equal(await page.locator("#history-count").textContent(), "0");
  await page.locator("#cohorts-tab").click();
  assert.deepEqual(await page.locator("#cohort-cards .metric").allTextContents(), ["—mmHg", "—mmHg", "—mmHg"]);
  await seed(page, samples);
  await page.reload();
  assert.equal(await page.locator("#history-count").textContent(), "9");
  assert.equal(await page.locator("#bp-chart circle").count(), 16);
  await page.locator('[data-days="all"]').click();
  assert.equal(await page.locator("#bp-chart circle").count(), 18);
  await page.locator("#cohorts-tab").click();
  assert.deepEqual(await page.locator("#cohort-cards .metric").allTextContents(), ["130/85mmHg", "145/93mmHg", "115/75mmHg"]);
  assert.deepEqual(await page.locator("#cohort-cards .card-note:last-child").allTextContents(), ["Liczba pomiarów: 3", "Liczba pomiarów: 2", "Liczba pomiarów: 2"]);
  await page.locator("#cohorts-tab").press("Home");
  assert.equal(await page.locator("#measurements-panel").isVisible(), true);
  await page.locator("#measurements-tab").press("ArrowRight");
  assert.equal(await page.locator("#cohorts-panel").isVisible(), true);
  await seed(page, [samples[0], samples[7]]);
  assert.deepEqual(await page.locator("#cohort-cards .metric").allTextContents(), ["—mmHg", "—mmHg", "—mmHg"]);
});

test("create, validation, paste, edit, delete and persisted measurements", async t => {
  const page = await openPage(t);
  await page.locator("#add").click();
  assert.equal(await page.locator("#date").inputValue(), "2026-11-28");
  assert.equal(await page.locator("#time").inputValue(), "16:30");
  await submit(page, { systolic: "80", diastolic: "120" });
  assert.match(await page.locator("#form-error").textContent(), /skurczowe musi/);
  assert.equal(await page.locator("#history-count").textContent(), "0");
  await page.locator("#systolic").evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "120/80 69");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await page.locator(".save").click();
  assert.equal(await page.locator("#measurement-dialog").isVisible(), false);
  await page.reload();
  assert.equal(await page.locator("#history-count").textContent(), "1");
  assert.equal(await page.locator("#latest-sys").textContent(), "120");
  await page.locator("#cohorts-tab").click();
  assert.equal(await page.locator("#cohort-cards .metric").first().textContent(), "120/80mmHg");
  await page.locator("#measurements-tab").click();
  await page.locator('[aria-label^="Edytuj pomiar"]').click();
  await submit(page, { systolic: "130", diastolic: "85", time: "18:00" });
  await page.locator("#cohorts-tab").click();
  assert.deepEqual(await page.locator("#cohort-cards .metric").allTextContents(), ["—mmHg", "—mmHg", "130/85mmHg"]);
  await page.locator("#measurements-tab").click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator(".delete").click();
  assert.equal(await page.locator("#history-count").textContent(), "1");
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".delete").click();
  await page.reload();
  assert.equal(await page.locator("#history-count").textContent(), "0");
});

test("backup compatibility, deduplication, malformed imports and export", async t => {
  const page = await openPage(t);
  const backup = JSON.stringify({ version: 1, measurements: samples });
  for (let i = 0; i < 2; i++) {
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#import-file").setInputFiles({
      name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup)
    });
    await page.waitForFunction(() => document.getElementById("history-count").textContent === "9" &&
      document.getElementById("import-file").value === "");
  }
  assert.equal(await page.locator("#history-count").textContent(), "9");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export").click();
  const download = await downloadPromise;
  const exported = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  assert.equal(exported.version, 1);
  assert.deepEqual(exported.measurements.map(record => record.id).sort(), samples.map(record => record.id).sort());
  for (const invalid of [
    '{"version":1,"measurements":[null]}',
    JSON.stringify({ version: 1, measurements: [{ ...samples[0], systolic: "120" }] }),
    JSON.stringify({ version: 1, measurements: [{ ...samples[0], date: "2026-02-30" }] }),
    JSON.stringify({ version: 1, measurements: [samples[0], samples[0]] })
  ]) {
    await page.locator("#import-file").setInputFiles({
      name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(invalid)
    });
    await page.waitForFunction(() => document.getElementById("storage-error").textContent.includes("Nie zaimportowano") &&
      document.getElementById("import-file").value === "");
    assert.equal(await page.locator("#history-count").textContent(), "9");
  }
});

test("storage errors do not overwrite or falsely report saved data", async t => {
  const page = await openPage(t);
  await page.evaluate(key => localStorage.setItem(key, "broken-json"), storageKey);
  await page.reload();
  assert.equal(await page.locator("#add").isDisabled(), true);
  assert.equal(await page.locator("#storage-error").isVisible(), true);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), "broken-json");
  await page.evaluate(key => localStorage.removeItem(key), storageKey);
  await page.reload();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
  });
  await page.locator("#add").click();
  await submit(page);
  assert.equal(await page.locator("#measurement-dialog").isVisible(), true);
  assert.match(await page.locator("#form-error").textContent(), /Nie zapisano zmian/);
  assert.equal(await page.locator("#history-count").textContent(), "0");
});

test("responsive views, chart redraw and history pagination", async t => {
  const page = await openPage(t);
  await seed(page, Array.from({ length: 25 }, (_, index) =>
    measurement(`sample-${index}`, `08:${String(index).padStart(2, "0")}`, 120 + index, 80)));
  assert.equal(await page.locator(".history-row").count(), 10);
  await page.locator("#more").click();
  assert.equal(await page.locator(".history-row").count(), 25);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ["cohorts-tab", "measurements-tab"]) {
      await page.locator(`#${tab}`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.ok(Number((await page.locator("#bp-chart").getAttribute("viewBox")).split(" ")[2]) > 240);
    await page.locator("#add").click();
    assert.equal(await page.evaluate(() => {
      const dialog = document.getElementById("measurement-dialog");
      return dialog.scrollWidth <= dialog.clientWidth;
    }), true);
    await page.locator("#close-dialog").click();
  }
});

test("pixel-identical views before and after refactoring", { skip: !process.env.VITALCHECK_BASELINE }, async t => {
  const current = await openPage(t);
  const original = await openPage(t, pathToFileURL(process.env.VITALCHECK_BASELINE).href);
  for (const page of [original, current]) await seed(page, samples);
  for (const width of [390, 1280]) {
    for (const page of [original, current]) await page.setViewportSize({ width, height: 900 });
    for (const tab of ["measurements-tab", "cohorts-tab"]) {
      for (const page of [original, current]) {
        await page.locator(`#${tab}`).click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator(`#${tab}`).blur();
        await page.mouse.move(0, 0);
      }
      assert.deepEqual(await current.screenshot({ fullPage: true }), await original.screenshot({ fullPage: true }), `${tab} at ${width}px`);
    }
    for (const page of [original, current]) await page.locator("#add").click();
    assert.deepEqual(await current.screenshot({ fullPage: true, caret: "hide" }), await original.screenshot({ fullPage: true, caret: "hide" }), `Form at ${width}px`);
    for (const page of [original, current]) await page.locator("#close-dialog").click();
  }
});
