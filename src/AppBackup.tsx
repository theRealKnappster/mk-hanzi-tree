import { useRef, useState } from "react";
import type { StoredProgress } from "./App";
import { listSheets, mergeBackup, parseBackup, putSheets } from "./practice/storage";
import type { PracticeSheet } from "./practice/types";

export const PROGRESS_KEY = "mk-hanzi-tree-progress-v1";
type Backup = { format: "hanzi-tree-complete"; version: 1; exportedAt: string; progress: StoredProgress; sheets: PracticeSheet[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function parseCompleteBackup(text: string): Backup {
  if (text.length > 50_000_000) throw new Error("This backup is too large (limit: 50 MB).");
  const data: unknown = JSON.parse(text);
  if (!object(data) || data.format !== "hanzi-tree-complete" || data.version !== 1 || typeof data.exportedAt !== "string" || !Number.isFinite(Date.parse(data.exportedAt))) throw new Error("Choose a complete Hanzi Tree backup. Handwriting-only backups can be imported in Writing practice.");
  const p = data.progress;
  if (!object(p) || !count(p.introduced) || Number(p.introduced) > 10000 || !count(p.sessions) || !count(p.totalPrompts)) throw new Error("The backup contains invalid lesson progress.");
  for (const records of [p.characters, p.words]) {
    if (!object(records) || Object.keys(records).length > 10000) throw new Error("The backup contains invalid lesson records.");
    for (const [key, record] of Object.entries(records)) {
      if (!key || key.length > 100 || !object(record) || !object(record.attempts) || !object(record.correct)) throw new Error("The backup contains invalid lesson records.");
      for (const path of ["writing", "sound", "meaning"]) {
        if (!count(record[path]) || Number(record[path]) > 3 || !count(record.attempts[path]) || !count(record.correct[path]) || Number(record.correct[path]) > Number(record.attempts[path])) throw new Error("The backup contains invalid lesson scores.");
      }
    }
  }
  const sheets = parseBackup(JSON.stringify({ format: "hanzi-tree-handwriting", version: 1, sheets: data.sheets }));
  return { format: "hanzi-tree-complete", version: 1, exportedAt: data.exportedAt, progress: p as StoredProgress, sheets };
}

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `hanzi-tree-complete-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default function AppBackup({ progress, onImport }: { progress: StoredProgress; onImport: (progress: StoredProgress) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Backup | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const error = (e: unknown) => setMessage(e instanceof Error ? e.message : "Backup could not be completed. Try again.");
  async function exportAll() {
    setBusy(true); setMessage("");
    try {
      const sheets = await listSheets();
      download(JSON.stringify({ format: "hanzi-tree-complete", version: 1, exportedAt: new Date().toISOString(), progress, sheets }));
      setMessage(`Complete backup downloaded: ${progress.sessions} chapters, ${progress.totalPrompts} lesson attempts, ${sheets.length} handwriting sheets.`);
    } catch (e) { error(e); } finally { setBusy(false); }
  }
  async function inspect(file: File) {
    setBusy(true); setPreview(null); setMessage("");
    try {
      if (file.size > 50_000_000) throw new Error("This backup is too large (limit: 50 MB).");
      setPreview(parseCompleteBackup(await file.text()));
    } catch (e) { error(e); } finally { setBusy(false); }
  }
  async function apply() {
    if (!preview) return;
    setBusy(true); setMessage("");
    try {
      const additions = mergeBackup(await listSheets(), preview.sheets);
      const previous = localStorage.getItem(PROGRESS_KEY);
      // Check that lesson storage is writable before changing any handwriting records.
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(preview.progress));
      try { await putSheets(additions); }
      catch (e) {
        if (previous === null) localStorage.removeItem(PROGRESS_KEY); else localStorage.setItem(PROGRESS_KEY, previous);
        throw e;
      }
      onImport(preview.progress);
      setPreview(null);
      setMessage(`Import complete. Lesson progress restored; ${additions.length} handwriting sheets added. Identical sheets were skipped.`);
    } catch (e) { error(e); } finally { setBusy(false); }
  }
  return <section className="complete-backup" aria-labelledby="backup-title">
    <h2 id="backup-title">Move or back up all progress</h2>
    <p>Includes lesson progress and handwriting sheets. To move from Safari, export here, then import the file in the Home Screen app. Future progress stays in the version you use.</p>
    <div className="backup-controls">
      <button className="text-button" disabled={busy || !!preview} onClick={() => void exportAll()}>Export complete backup</button>
      <button className="text-button" disabled={busy} onClick={() => input.current?.click()}>Import complete backup</button>
      <input ref={input} hidden type="file" accept=".json,application/json" aria-label="Choose complete backup" onChange={(e) => { const file = e.target.files?.[0]; if (file) void inspect(file); e.target.value = ""; }} />
    </div>
    {preview && <div className="backup-preview" aria-label="Import preview">
      <h3>Review before importing</h3>
      <p>Backup created {new Date(preview.exportedAt).toLocaleString()}.</p>
      <table><thead><tr><th scope="col">Progress</th><th scope="col">On this device</th><th scope="col">In backup</th></tr></thead><tbody>
        <tr><th scope="row">Chapters</th><td>{progress.sessions}</td><td>{preview.progress.sessions}</td></tr>
        <tr><th scope="row">Lesson attempts</th><td>{progress.totalPrompts}</td><td>{preview.progress.totalPrompts}</td></tr>
        <tr><th scope="row">Characters challenged</th><td>{progress.introduced}</td><td>{preview.progress.introduced}</td></tr>
      </tbody></table>
      <p>This will <strong>replace lesson progress on this device</strong> with the backup. It will add up to {preview.sheets.length} handwriting sheets, skip identical sheets, and keep existing sheets. Changed copies are kept separately.</p>
      <p>Export this device’s complete backup first if you want to keep its current lesson progress.</p>
      <div className="backup-controls"><button className="text-button" disabled={busy} onClick={() => void exportAll()}>Back up this device first</button><button className="primary-button" disabled={busy} onClick={() => void apply()}>Apply import</button><button className="text-button" disabled={busy} onClick={() => setPreview(null)}>Cancel import</button></div>
    </div>}
    <p role="status">{busy ? "Working…" : message}</p>
  </section>;
}
