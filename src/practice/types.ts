export type InkPoint = { x: number; y: number; pressure: number; time: number };
export type InkStroke = { id: string; startedAt: string; points: InkPoint[] };
export type Reference = { strokes: string[]; medians: number[][][]; source: string };
export type PracticeCharacter = { character: string; pinyin: string; meaning: string };
export type PracticeRow = PracticeCharacter & {
  id: string;
  reference?: Reference;
  boxes: InkStroke[][];
};
export type PracticeSheet = {
  version: 1;
  id: string;
  layout: "copybook" | "blank";
  guides: boolean;
  rows: PracticeRow[];
  createdAt: string;
  firstWritingAt?: string;
  practiceDate?: string;
  timezone: string;
  lastSavedAt: string;
  status: "draft" | "finished";
};

export const BOX_COUNT = 6;
export const REFERENCE_SOURCE = "Hanzi Writer Data 2.0.1 / Make Me a Hanzi; geometry snapshot v1";
export const hasInk = (strokes: InkStroke[]) => strokes.some((stroke) => stroke.points.length > 0);
export const writtenBoxes = (sheet: PracticeSheet) => sheet.rows.reduce((sum, row) => sum + row.boxes.filter(hasInk).length, 0);
export const writtenCharacters = (sheet: PracticeSheet) => [...new Set(sheet.rows.filter((row) => row.boxes.some(hasInk)).map((row) => row.character))];

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function makeSheet(characters: PracticeCharacter[], layout: PracticeSheet["layout"], guides: boolean): PracticeSheet {
  const now = new Date().toISOString();
  return {
    version: 1, id: crypto.randomUUID(), layout, guides,
    rows: characters.map((character) => ({ ...character, id: crypto.randomUUID(), boxes: Array.from({ length: BOX_COUNT }, () => []) })),
    createdAt: now, lastSavedAt: now,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", status: "draft",
  };
}

export function editBox(sheet: PracticeSheet, rowId: string, box: number, strokes: InkStroke[], now = new Date()): PracticeSheet {
  const row = sheet.rows.find((entry) => entry.id === rowId);
  if (sheet.status !== "draft" || !row || box < 0 || box >= row.boxes.length) return sheet;
  const next = {
    ...sheet, lastSavedAt: now.toISOString(),
    rows: sheet.rows.map((entry) => entry.id === rowId ? { ...entry, boxes: entry.boxes.map((value, index) => index === box ? strokes : value) } : entry),
  };
  if (!next.firstWritingAt && hasInk(strokes)) {
    const startedAt = strokes.find((stroke) => stroke.points.length)?.startedAt || now.toISOString();
    next.firstWritingAt = startedAt;
    next.practiceDate = localDate(new Date(startedAt));
    next.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
  return next;
}
