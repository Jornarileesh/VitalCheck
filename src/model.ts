export interface Measurement {
  id: string;
  systolic: number;
  diastolic: number;
  pulse: number;
  date: string;
  time: string;
}

export type ReadingKey = "systolic" | "diastolic" | "pulse";

export const STORAGE_KEY = "vitalcheck.measurements.v1";
const pad = (value: number): string => String(value).padStart(2, "0");

export const localDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const localTime = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
export const timestamp = (record: Measurement): number => new Date(`${record.date}T${record.time}:00`).getTime();
export const sortRecords = (list: Measurement[]): Measurement[] =>
  list.sort((a, b) => timestamp(a) - timestamp(b) || a.id.localeCompare(b.id));
export const averageReading = (list: readonly Measurement[], key: ReadingKey): number | null =>
  list.length ? Math.round(list.reduce((sum, record) => sum + record[key], 0) / list.length) : null;

export const cohorts = [
  { label: "Rano", start: "06:00", end: "12:00", hours: "06:00–11:59" },
  { label: "Popołudniu", start: "12:00", end: "18:00", hours: "12:00–17:59" },
  { label: "Wieczorem", start: "18:00", end: "22:00", hours: "18:00–21:59" }
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}

export function validationError(record: unknown): string {
  if (!isObject(record)) return "Nieprawidłowy pomiar.";
  if (!isIntegerInRange(record.systolic, 350) || !isIntegerInRange(record.diastolic, 350))
    return "Ciśnienie: wpisz pełne liczby od 1 do 350 mmHg.";
  if (record.systolic <= record.diastolic) return "Ciśnienie skurczowe musi być wyższe niż rozkurczowe.";
  if (!isIntegerInRange(record.pulse, 300))
    return "Puls: wpisz pełną liczbę od 1 do 300 ud./min.";
  if (typeof record.date !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(record.date) ||
      record.date < "1900-01-01" || typeof record.time !== "string" || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(record.time))
    return "Podaj prawidłową datę i godzinę.";
  const date = new Date(`${record.date}T${record.time}:00`);
  if (!Number.isFinite(date.getTime()) || localDate(date) !== record.date || localTime(date) !== record.time)
    return "Podaj prawidłową datę i godzinę.";
  return "";
}

function hasMeasurementFields(value: unknown): value is Measurement {
  return isObject(value) && typeof value.id === "string" &&
    typeof value.systolic === "number" && typeof value.diastolic === "number" &&
    typeof value.pulse === "number" && typeof value.date === "string" && typeof value.time === "string";
}

export function parseBackup(text: string): Measurement[] {
  const data: unknown = JSON.parse(text);
  if (!isObject(data) || data.version !== 1 || !Array.isArray(data.measurements))
    throw new Error("Nieprawidłowy format kopii VitalCheck.");
  const ids = new Set<string>();
  return sortRecords(data.measurements.map((record: unknown) => {
    const error = validationError(record);
    if (error || !hasMeasurementFields(record) || !/^[a-zA-Z0-9-]{1,100}$/.test(record.id) || ids.has(record.id))
      throw new Error(error || "Nieprawidłowe lub powtórzone identyfikatory pomiarów.");
    ids.add(record.id);
    return { id: record.id, systolic: record.systolic, diastolic: record.diastolic,
      pulse: record.pulse, date: record.date, time: record.time };
  }));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
