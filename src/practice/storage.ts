import type { PracticeSheet } from "./types";

const DATABASE = "mk-hanzi-tree-handwriting-v1";
const STORE = "sheets";
let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("This browser cannot save practice sheets.")); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("Close other Hanzi Tree tabs, then try saving again.")); };
  });
  return database;
}

export async function listSheets(): Promise<PracticeSheet[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as PracticeSheet[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error);
  });
}

export async function putSheets(sheets: PracticeSheet[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    sheets.forEach((sheet) => transaction.objectStore(STORE).put(sheet));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Practice was not saved."));
  });
}

// Keep writes in order even if a stroke is made while the previous transaction is pending.
let queue = Promise.resolve();
export function saveSheet(sheet: PracticeSheet): Promise<void> {
  const snapshot = structuredClone(sheet);
  const next = queue.catch(() => undefined).then(() => putSheets([snapshot]));
  queue = next;
  return next;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function parseBackup(text: string): PracticeSheet[] {
  if (text.length > 50_000_000) throw new Error("This backup is too large (limit: 50 MB).");
  const data: unknown = JSON.parse(text);
  if (!object(data) || data.format !== "hanzi-tree-handwriting" || data.version !== 1 || !Array.isArray(data.sheets) || data.sheets.length > 5000) throw new Error("Choose a Hanzi Tree handwriting backup (version 1).");
  const ids = new Set<string>();
  for (const sheet of data.sheets) {
    if (!object(sheet) || sheet.version !== 1 || typeof sheet.id !== "string" || !sheet.id || ids.has(sheet.id) || !["copybook", "blank"].includes(String(sheet.layout)) || !["draft", "finished"].includes(String(sheet.status)) || typeof sheet.guides !== "boolean" || typeof sheet.timezone !== "string" || !timestamp(sheet.createdAt) || !timestamp(sheet.lastSavedAt) || !Array.isArray(sheet.rows) || !sheet.rows.length || sheet.rows.length > 12) throw new Error("The backup contains an invalid practice sheet.");
    ids.add(sheet.id);
    try { new Intl.DateTimeFormat(undefined, { timeZone: sheet.timezone }); } catch { throw new Error("The backup contains an invalid timezone."); }
    if (sheet.firstWritingAt !== undefined && (!timestamp(sheet.firstWritingAt) || typeof sheet.practiceDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sheet.practiceDate))) throw new Error("The backup contains an invalid practice date.");
    const rowIds = new Set<string>();
    for (const row of sheet.rows) {
      if (!object(row) || typeof row.id !== "string" || rowIds.has(row.id) || typeof row.character !== "string" || [...row.character].length !== 1 || typeof row.pinyin !== "string" || typeof row.meaning !== "string" || !Array.isArray(row.boxes) || row.boxes.length !== 6) throw new Error("The backup contains an invalid character row.");
      rowIds.add(row.id);
      for (const box of row.boxes) {
        if (!Array.isArray(box) || box.length > 1000) throw new Error("The backup contains an invalid writing box.");
        for (const stroke of box) {
          if (!object(stroke) || typeof stroke.id !== "string" || !timestamp(stroke.startedAt) || !Array.isArray(stroke.points) || stroke.points.length > 100_000) throw new Error("The backup contains an invalid stroke.");
          if ((stroke.style !== undefined && stroke.style !== "pen" && stroke.style !== "brush") || (stroke.sensitivity !== undefined && (!number(stroke.sensitivity) || Number(stroke.sensitivity) < 1 || Number(stroke.sensitivity) > 3))) throw new Error("The backup contains invalid brush settings.");
          let previousTime = -1;
          for (const point of stroke.points) {
            if (!object(point) || ![point.x, point.y, point.pressure, point.time].every(number) || Number(point.x) < 0 || Number(point.x) > 1 || Number(point.y) < 0 || Number(point.y) > 1 || Number(point.pressure) < 0 || Number(point.pressure) > 1 || Number(point.time) < previousTime || Number(point.time) < 0) throw new Error("The backup contains invalid ink samples.");
            previousTime = Number(point.time);
          }
        }
      }
      if (row.reference !== undefined) {
        const reference = row.reference;
        if (!object(reference) || typeof reference.source !== "string" || !Array.isArray(reference.strokes) || !reference.strokes.length || reference.strokes.length > 100 || !reference.strokes.every((path) => typeof path === "string" && path.length < 100_000 && /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+\-eE]+$/.test(path)) || !Array.isArray(reference.medians) || reference.medians.length !== reference.strokes.length || !reference.medians.every((median) => Array.isArray(median) && median.length > 0 && median.length < 10_000 && median.every((point) => Array.isArray(point) && point.length === 2 && point.every(number)))) throw new Error("The backup contains invalid model geometry.");
      }
    }
  }
  return data.sheets as PracticeSheet[];
}

export function serializeBackup(sheets: PracticeSheet[]): string {
  return JSON.stringify({ format: "hanzi-tree-handwriting", version: 1, exportedAt: new Date().toISOString(), sheets });
}

// An import never replaces an existing sheet. Conflicting copies get a fresh identity.
export function mergeBackup(existing: PracticeSheet[], incoming: PracticeSheet[]): PracticeSheet[] {
  const byId = new Map(existing.map((sheet) => [sheet.id, sheet]));
  const additions: PracticeSheet[] = [];
  for (const sheet of incoming) {
    const previous = byId.get(sheet.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(sheet)) continue;
    const next = previous ? { ...sheet, id: crypto.randomUUID() } : sheet;
    byId.set(next.id, next); additions.push(next);
  }
  return additions;
}
