import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Download, Eraser, History, Paintbrush, PencilLine, Plus, Redo2, Undo2, Upload, X } from "lucide-react";
import InkBox from "./InkBox";
import ModelCharacter from "./ModelCharacter";
import { compareInk } from "./ink";
import { renderSheetImage } from "./exportImage";
import { listSheets, mergeBackup, parseBackup, putSheets, saveSheet, serializeBackup } from "./storage";
import { editBox, hasInk, localDate, makeSheet, writtenBoxes, writtenCharacters } from "./types";
import type { InkStroke, PracticeCharacter, PracticeRow, PracticeSheet, Reference } from "./types";
import "./practice.css";

type Selection = { rowId: string; box: number };
type Edit = Selection & { before: InkStroke[]; after: InkStroke[] };

const dateLabel = (sheet: PracticeSheet) => sheet.practiceDate ? new Date(`${sheet.practiceDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not started";
const emptyBoxes = (sheet: PracticeSheet) => !writtenBoxes(sheet);
const boxLabel = (count: number) => `${count} filled ${count === 1 ? "box" : "boxes"}`;

function ComparisonBox({ row, strokes, overlay, highlight = false, guides = true, label }: { row: PracticeRow; strokes: InkStroke[]; overlay: boolean; highlight?: boolean; guides?: boolean; label: string }) {
  const observation = row.reference ? compareInk(strokes, row.reference).find((note) => note.region) : undefined;
  return <div className={`practice-box comparison-box ${guides ? "with-guides" : ""}`}>
    {overlay && row.reference && <div className="model-overlay"><ModelCharacter character={row.character} reference={row.reference} faint /></div>}
    <InkBox strokes={strokes} label={label} readOnly />
    {highlight && observation?.region && <svg viewBox="0 0 1000 1000" className="observation-highlight" aria-hidden="true">
      <rect x={observation.region.left * 1000} y={observation.region.top * 1000} width={Math.max(8, observation.region.width * 1000)} height={Math.max(8, observation.region.height * 1000)} fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="20 15" />
    </svg>}
  </div>;
}

function ReviewBox({ row, box, onClose }: { row: PracticeRow; box: number; onClose: () => void }) {
  const [overlay, setOverlay] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const scrollX = window.scrollX, scrollY = window.scrollY;
    element?.showModal();
    document.body.style.overflow = "hidden";
    window.scrollTo(scrollX, scrollY);
    return () => {
      element?.close(); document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
      window.scrollTo(scrollX, scrollY);
    };
  }, []);
  const strokes = row.boxes[box];
  const notes = row.reference ? compareInk(strokes, row.reference) : [];
  return <dialog ref={dialog} className="comparison-dialog" aria-label="Compare with the model" onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')).filter((element) => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <div className="comparison-dialog-heading"><h2>Compare with model</h2><button className="icon-button" aria-label="Close comparison" autoFocus onClick={onClose}><X /></button></div>
    <section className="handwriting-review" aria-label="Character comparison">
    <div className="practice-section-heading"><div><p className="eyebrow">Look, then try again</p><h2>{row.character} · Box {box + 1}</h2></div><label className="practice-check"><input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} /> Overlay model</label></div>
    <div className="review-pair">
      <div><span>Model</span><div className="practice-box with-guides reference-box">{row.reference ? <ModelCharacter character={row.character} reference={row.reference} /> : <span className="reference-fallback">{row.character}</span>}</div></div>
      <div><span>Your writing</span><ComparisonBox row={row} strokes={strokes} overlay={overlay} highlight label={`Your writing of ${row.character}, box ${box + 1}`} /></div>
    </div>
    {row.reference ? <div className="shape-observations" role="status">
      <strong>{notes[0]?.text}</strong>
      {notes.slice(1, 3).map((note) => <p key={note.text}>{note.text}</p>)}
      <small>Compare placement and size, not an exact font match. These observations are not a handwriting grade.</small>
    </div> : <p className="practice-muted">No saved comparison model is available for this character. Your handwriting is still saved.</p>}
    </section>
  </dialog>;
}

function DateComparison({ character, sheets }: { character: string; sheets: PracticeSheet[] }) {
  const relevant = sheets.filter((sheet) => sheet.rows.some((row) => row.character === character && row.boxes.some(hasInk)));
  const [leftId, setLeftId] = useState(relevant.at(-1)?.id || "");
  const [rightId, setRightId] = useState(relevant[0]?.id || "");
  const [overlay, setOverlay] = useState(true);
  const [modelSheetId, setModelSheetId] = useState(relevant[0]?.id || "");
  const left = relevant.find((sheet) => sheet.id === leftId) || relevant.at(-1);
  const right = relevant.find((sheet) => sheet.id === rightId) || relevant[0];
  const referenceRow = relevant.find((sheet) => sheet.id === modelSheetId)?.rows.find((row) => row.character === character && row.reference);
  const reference = referenceRow?.reference;
  if (!left || !right) return null;
  const pane = (sheet: PracticeSheet, side: "earlier" | "later") => <div className="date-comparison-pane">
    <label>{side === "earlier" ? "First sheet" : "Second sheet"}<select aria-label={`${side} comparison sheet`} value={sheet.id} onChange={(event) => side === "earlier" ? setLeftId(event.target.value) : setRightId(event.target.value)}>
      {relevant.map((entry, index) => <option key={entry.id} value={entry.id}>{dateLabel(entry)} · Page {relevant.length - index} · {entry.status}</option>)}
    </select></label>
    <div className="history-repetitions">{sheet.rows.filter((row) => row.character === character).flatMap((row) => row.boxes.map((strokes, index) => hasInk(strokes) ? <figure key={`${row.id}-${index}`}>
      <ComparisonBox row={{ ...row, reference }} strokes={strokes} overlay={overlay} label={`${character} on ${dateLabel(sheet)}, box ${index + 1}`} />
      <figcaption>Box {index + 1}</figcaption>
    </figure> : null))}</div>
  </div>;
  return <section className="date-comparison" aria-label={`Compare ${character} over time`}>
    <div className="practice-section-heading"><div><p className="eyebrow">Same character, different days</p><h2>{character} over time</h2></div><label className="practice-check"><input type="checkbox" checked={overlay} disabled={!reference} onChange={(event) => setOverlay(event.target.checked)} /> Overlay the same model</label></div>
    <label className="comparison-model-choice">Comparison model from<select value={modelSheetId} onChange={(event) => setModelSheetId(event.target.value)}>{relevant.map((sheet, index) => sheet.rows.some((row) => row.character === character && row.reference) ? <option value={sheet.id} key={sheet.id}>{dateLabel(sheet)} · Page {relevant.length - index}</option> : null)}</select></label>
    {!reference && <p className="practice-muted">These sheets have no saved reference. Compare the handwriting directly.</p>}
    <div className="date-comparison-grid">{pane(left, "earlier")}{pane(right, "later")}</div>
    {relevant.length < 2 && <p className="practice-muted">One sheet so far. Practice again to compare two dates.</p>}
  </section>;
}

export default function WritingPractice({ characters, onClose }: { characters: PracticeCharacter[]; onClose: () => void }) {
  const [sheets, setSheets] = useState<PracticeSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"paper" | "history">("paper");
  const [sheet, setSheet] = useState<PracticeSheet | null>(null);
  const current = useRef<PracticeSheet | null>(null);
  const [text, setText] = useState("一二三十人");
  const [layout, setLayout] = useState<PracticeSheet["layout"]>("copybook");
  const [guides, setGuides] = useState(true);
  const [rowsPerCharacter, setRowsPerCharacter] = useState(1);
  const [inputMode, setInputMode] = useState<"pencil" | "finger">("pencil");
  const [tool, setTool] = useState<"brush" | "pen" | "eraser">("brush");
  const [sensitivity, setSensitivity] = useState(2);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [review, setReview] = useState(false);
  const [construction, setConstruction] = useState(false);
  const [undo, setUndo] = useState<Edit[]>([]);
  const [redo, setRedo] = useState<Edit[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [message, setMessage] = useState("");
  const [exportingImage, setExportingImage] = useState(false);
  const [confirmation, setConfirmation] = useState<"box" | "sheet" | null>(null);
  const [historyCharacter, setHistoryCharacter] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef(0);
  const failed = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    listSheets().then((records) => { if (alive.current) { setSheets(records); setLoading(false); } }).catch(() => { if (alive.current) { setLoading(false); setMessage("Could not open saved handwriting. Enable website storage and reload before practicing."); setSaveState("error"); failed.current = true; } });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (pending.current || failed.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { alive.current = false; window.removeEventListener("beforeunload", beforeUnload); };
  }, []);

  const persist = (next: PracticeSheet) => {
    pending.current += 1; setSaveState("saving");
    saveSheet(next).then(() => {
      if (current.current?.id === next.id && current.current.lastSavedAt === next.lastSavedAt) failed.current = false;
      if (alive.current) setSheets((records) => [next, ...records.filter((record) => record.id !== next.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }).catch(() => { failed.current = true; if (alive.current) setMessage("Your latest changes were not saved. Keep this page open and retry saving or export a backup."); }).finally(() => {
      pending.current -= 1;
      if (alive.current && pending.current === 0) setSaveState(failed.current ? "error" : "saved");
    });
  };
  const replace = (next: PracticeSheet, save = true) => { current.current = next; setSheet(next); if (save) persist(next); };
  const updateReference = (sheetId: string, rowId: string, reference: Reference) => {
    const value = current.current;
    if (!value || value.id !== sheetId || value.status !== "draft" || value.rows.find((row) => row.id === rowId)?.reference) return;
    replace({ ...value, lastSavedAt: new Date().toISOString(), rows: value.rows.map((row) => row.id === rowId ? { ...row, reference } : row) });
  };
  const updateBox = (selection: Selection, strokes: InkStroke[], recordUndo = true) => {
    const value = current.current;
    const row = value?.rows.find((entry) => entry.id === selection.rowId);
    if (!value || !row || value.status !== "draft") return;
    if (recordUndo) { setUndo((edits) => [...edits, { ...selection, before: row.boxes[selection.box], after: strokes }].slice(-100)); setRedo([]); }
    replace(editBox(value, selection.rowId, selection.box, strokes));
  };
  const undoEdit = () => {
    const edit = undo.at(-1); if (!edit) return;
    updateBox(edit, edit.before, false); setUndo((edits) => edits.slice(0, -1)); setRedo((edits) => [...edits, edit]); setSelected(edit);
  };
  const redoEdit = () => {
    const edit = redo.at(-1); if (!edit) return;
    updateBox(edit, edit.after, false); setRedo((edits) => edits.slice(0, -1)); setUndo((edits) => [...edits, edit]); setSelected(edit);
  };
  const safeToLeave = () => {
    if (pending.current || failed.current) { setMessage("Wait for saving to finish, or retry saving before leaving this sheet."); return false; }
    return true;
  };
  const openSheet = (record: PracticeSheet) => {
    if (!safeToLeave()) return;
    current.current = record; setSheet(record); setSelected(null); setUndo([]); setRedo([]); setReview(false); setMessage(""); setView("paper");
  };
  const start = () => {
    if (!safeToLeave()) return;
    const entered = [...new Set([...text].filter((character) => /\p{Script=Han}/u.test(character)))];
    if (!entered.length) { setMessage("Choose or enter at least one Chinese character."); return; }
    if (entered.length * rowsPerCharacter > 12) { setMessage("Use up to 12 rows per sheet. Choose fewer characters or fewer rows per character."); return; }
    const entries = entered.map((character) => characters.find((entry) => entry.character === character) || { character, pinyin: "", meaning: "" });
    replace(makeSheet(entries.flatMap((entry) => Array.from({ length: rowsPerCharacter }, () => entry)), layout, guides)); setUndo([]); setRedo([]); setSelected(null); setReview(false); setMessage("");
  };
  const exportBackup = async () => {
    try {
      const records = await listSheets();
      const value = current.current;
      const complete = value ? [value, ...records.filter((record) => record.id !== value.id)] : records;
      const blob = new Blob([serializeBackup(complete)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `hanzi-handwriting-${localDate()}.json`; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage("Backup downloaded. Keep it somewhere you can find again.");
    } catch { setMessage("Could not export saved sheets. Keep this page open and retry."); }
  };
  const exportImage = async () => {
    const value = current.current;
    if (!value || exportingImage) return;
    setExportingImage(true);
    try {
      const snapshot = structuredClone(value);
      const blob = await renderSheetImage(snapshot);
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `hanzi-practice-${snapshot.practiceDate || localDate()}.png`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage("Practice image downloaded. Attach the PNG to your homework. Use Export backup to keep an editable copy.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not export the practice image. Please try again."); }
    finally { setExportingImage(false); }
  };
  const importBackup = async (file: File) => {
    if (!safeToLeave()) return;
    try {
      if (file.size > 50_000_000) throw new Error("Choose a backup smaller than 50 MB.");
      const incoming = parseBackup(await file.text());
      const existing = await listSheets();
      const additions = mergeBackup(existing, incoming);
      await putSheets(additions); setSheets(await listSheets());
      setMessage(!incoming.length ? "This backup contains no practice sheets." : !additions.length ? "All sheets in this backup are already saved. No duplicates added." : `Imported ${additions.length} ${additions.length === 1 ? "sheet" : "sheets"}. Existing sheets were preserved.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import this backup."); }
  };

  const selectedRow = sheet?.rows.find((row) => row.id === selected?.rowId);
  const editable = sheet?.status === "draft";
  const histories = sheets.filter((record) => !emptyBoxes(record));
  const historyCharacters = [...new Set(histories.flatMap(writtenCharacters))];

  return <section className="copybook-module" aria-labelledby="copybook-title">
    <div className="copybook-header">
      <div><p className="eyebrow">The practice scrolls</p><h1 id="copybook-title">Writing practice</h1><p>Fill the boxes. Keep the pages. See what changes.</p></div>
      <button className="icon-button" aria-label="Close writing practice" onClick={() => { if (safeToLeave()) onClose(); }}><X /></button>
    </div>
    <div className="copybook-navigation">
      <div className="practice-tabs"><button className={view === "paper" ? "active" : ""} onClick={() => { if (safeToLeave()) setView("paper"); }}><PencilLine /> Paper</button><button className={view === "history" ? "active" : ""} onClick={() => { if (safeToLeave()) setView("history"); }}><History /> History</button></div>
      <div className="backup-actions"><button onClick={exportBackup} disabled={loading || pending.current > 0}><Download /> Export backup</button><button onClick={() => fileInput.current?.click()} disabled={loading || pending.current > 0}><Upload /> Import backup</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ""; }} /></div>
    </div>
    {message && <div className={`practice-message ${saveState === "error" ? "error" : ""}`} role="status">{message}{saveState === "error" && sheet && <button onClick={() => persist(current.current!)}>Retry saving</button>}</div>}
    {loading ? <p className="practice-muted">Opening your practice pages…</p> : view === "history" ? <>
      <div className="practice-section-heading"><div><h2>Your practice pages</h2><p className="practice-muted">{histories.length} sheets · {histories.reduce((sum, record) => sum + writtenBoxes(record), 0)} filled boxes</p></div><button className="practice-button" onClick={() => { if (safeToLeave()) { current.current = null; setSheet(null); setView("paper"); } }}><Plus /> New sheet</button></div>
      <label className="history-filter">Character<select aria-label="Filter handwriting by character" value={historyCharacter} onChange={(event) => setHistoryCharacter(event.target.value)}><option value="">All characters</option>{historyCharacters.map((character) => <option key={character}>{character}</option>)}</select></label>
      {historyCharacter && <DateComparison key={historyCharacter} character={historyCharacter} sheets={histories} />}
      {!histories.length && <div className="practice-empty"><PencilLine /><h2>Your first page starts here.</h2><p>Write in a box and your dated handwriting will appear here.</p></div>}
      <div className="sheet-history">{histories.filter((record) => !historyCharacter || writtenCharacters(record).includes(historyCharacter)).map((record) => <button key={record.id} className="sheet-card" onClick={() => openSheet(record)}>
        <div className="sheet-card-heading"><strong>{dateLabel(record)}</strong><span>{record.status === "draft" ? "Continue draft" : "View sheet"}</span></div>
        <div className="sheet-preview">{record.rows.filter((row) => row.boxes.some(hasInk)).slice(0, 4).map((row) => <div key={row.id}><ComparisonBox row={row} strokes={row.boxes.find(hasInk)!} overlay={false} label={`Handwriting preview of ${row.character}`} /><span>{row.character}</span></div>)}</div>
        <p>{writtenCharacters(record).join(" · ")} <span>— {boxLabel(writtenBoxes(record))}</span></p>
      </button>)}</div>
    </> : !sheet ? <div className="paper-setup">
      <div><h2>A fresh sheet</h2><label>Characters to practice<input value={text} onChange={(event) => setText(event.target.value)} placeholder="有口人爸妈哥" maxLength={100} /></label>
        <label>Add from your lessons<select value="" onChange={(event) => { if (event.target.value) setText((value) => value + event.target.value); }}><option value="">Choose a character…</option>{characters.map((entry) => <option key={entry.character} value={entry.character}>{entry.character} · {entry.pinyin} · {entry.meaning}</option>)}</select></label>
        <label>Rows per character<select value={rowsPerCharacter} onChange={(event) => setRowsPerCharacter(Number(event.target.value))}>{[1, 2, 3, 6, 12].map((count) => <option key={count} value={count}>{count} {count === 1 ? "row" : "rows"} · {count * 6} writing boxes</option>)}</select></label>
        <div className="paper-layout-options"><button className={layout === "copybook" ? "active" : ""} onClick={() => setLayout("copybook")}><strong>Copybook</strong><span>Model → trace → write freely</span></button><button className={layout === "blank" ? "active" : ""} onClick={() => setLayout("blank")}><strong>Blank boxes</strong><span>Your characters, open space</span></button></div>
        <label className="practice-check"><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} /> Center guides</label>
        <button className="practice-button primary" onClick={start} disabled={saveState === "error"}>Open the paper</button>
      </div><aside><div className="paper-sample" aria-hidden="true"><span>人</span><span className="faint">人</span><span className="faint">人</span><span /><span /><span /></div><h3>A little practice, kept.</h3><p>Press lightly for fine lines. Press more firmly for wider strokes. Each page keeps your own handwriting.</p><p className="practice-muted">Saved on this iPad or browser. Export a backup to keep a separate copy or move to another device.</p>
        {sheets.some((record) => record.status === "draft") && <div className="draft-list"><h3>Unfinished sheets</h3>{sheets.filter((record) => record.status === "draft").slice(0, 8).map((record) => <button key={record.id} onClick={() => openSheet(record)}>{record.rows.map((row) => row.character).join(" ")}<small>{dateLabel(record)} · {writtenBoxes(record)} boxes</small></button>)}</div>}
      </aside>
    </div> : <>
      <div className="paper-heading"><button className="practice-button" onClick={() => { if (safeToLeave()) { current.current = null; setSheet(null); } }}><ArrowLeft /> New / saved sheets</button><div><strong>{sheet.layout === "copybook" ? "Copybook" : "Blank practice"}</strong><span>{dateLabel(sheet)}{sheet.status === "finished" ? " · Finished" : " · Draft"}</span></div><span className={`save-indicator ${saveState}`} role="status">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved on this device"}</span></div>
      <div className="paper-toolbar" aria-label="Writing tools">
        {editable && <><div className="tool-group"><button className={tool === "brush" ? "active" : ""} onClick={() => setTool("brush")} aria-pressed={tool === "brush"}><Paintbrush /> Brush</button><button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")} aria-pressed={tool === "pen"}><PencilLine /> Fine pen</button><button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"}><Eraser /> Eraser</button></div>
          <button onClick={undoEdit} disabled={!undo.length} aria-label="Undo last ink edit"><Undo2 /> Undo</button><button onClick={redoEdit} disabled={!redo.length} aria-label="Redo last ink edit"><Redo2 /> Redo</button>
          <button disabled={!selected || !selectedRow || !hasInk(selectedRow.boxes[selected.box])} onClick={() => setConfirmation("box")}>Clear box</button>
          <label className="input-mode-label">Input<select aria-label="Writing input" value={inputMode} onChange={(event) => setInputMode(event.target.value as typeof inputMode)}><option value="pencil">Pencil</option><option value="finger">Finger / mouse</option></select></label>
          {tool === "brush" && <label className="input-mode-label">Pressure<select aria-label="Brush pressure response" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))}><option value={3}>Light touch</option><option value={2}>Balanced</option><option value={1}>Firm</option></select></label>}
        </>}
        <label className="practice-check"><input type="checkbox" checked={construction} onChange={(event) => setConstruction(event.target.checked)} /> Stroke examples</label>
        <button disabled={!selectedRow || !selected || !hasInk(selectedRow.boxes[selected.box])} className={review ? "active" : ""} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setReview((value) => !value); }}>Compare with model</button>
        <button onClick={() => void exportImage()} disabled={exportingImage || emptyBoxes(sheet)}><Download /> {exportingImage ? "Creating image…" : "Export image"}</button>
        {editable && <button className="finish-sheet" disabled={emptyBoxes(sheet) || saveState !== "saved"} onClick={() => replace({ ...current.current!, status: "finished", lastSavedAt: new Date().toISOString() })}><Check /> Finish sheet</button>}
      </div>
      <p className="paper-instruction">{editable ? "Write across the boxes. Tap a box to compare it with the model. Scroll outside the writing boxes." : "This finished sheet is kept as you wrote it. Tap a filled box to compare it with the model."}</p>
      {editable && tool === "brush" && <p className="paper-instruction">Brush ink: ease off for a fine tip, press gently for a broad stroke. Choose Light touch if broad strokes take too much effort.</p>}
      <div className="practice-paper-scroll"><div className="practice-paper">
        {sheet.rows.map((row) => <div className="copybook-row" key={row.id}>
          {construction && <ModelCharacter character={row.character} reference={row.reference} steps fetchMissing={editable} />}
          <div className="copybook-row-main"><div className="copybook-row-label"><strong>{row.character}</strong>{row.pinyin && <span>{row.pinyin}</span>}{row.meaning && <small>{row.meaning}</small>}</div>
            <div className={`copybook-boxes ${sheet.layout === "blank" ? "blank-layout" : ""}`}>
              {sheet.layout === "copybook" && <div className={`practice-box reference-box ${sheet.guides ? "with-guides" : ""}`}><ModelCharacter character={row.character} reference={row.reference} fetchMissing={editable} onLoad={(reference) => updateReference(sheet.id, row.id, reference)} /></div>}
              {sheet.layout === "blank" && !row.reference && editable && <div className="reference-loader" aria-hidden="true"><ModelCharacter character={row.character} onLoad={(reference) => updateReference(sheet.id, row.id, reference)} /></div>}
              {row.boxes.map((strokes, box) => <div key={box} className={`practice-box ${sheet.guides ? "with-guides" : ""} ${selected?.rowId === row.id && selected.box === box ? "selected" : ""}`}>
                {sheet.layout === "copybook" && box < 3 && <div className="model-overlay"><ModelCharacter character={row.character} reference={row.reference} faint fetchMissing={editable} /></div>}
                <InkBox strokes={strokes} readOnly={!editable} inputMode={inputMode} tool={tool} sensitivity={sensitivity} label={`Write ${row.character}, box ${box + 1}`} onSelect={() => setSelected({ rowId: row.id, box })} onChange={(ink) => updateBox({ rowId: row.id, box }, ink)} />
                <button className="box-selector" aria-label={`Select ${row.character}, box ${box + 1}`} aria-pressed={selected?.rowId === row.id && selected.box === box} onClick={() => setSelected({ rowId: row.id, box })}>{box + 1}</button>
              </div>)}
            </div>
          </div>
        </div>)}
      </div></div>
      {review && selectedRow && selected && hasInk(selectedRow.boxes[selected.box]) && <ReviewBox key={`${sheet.id}-${selectedRow.id}-${selected.box}`} row={selectedRow} box={selected.box} onClose={() => setReview(false)} />}
      <div className="paper-footer"><span>{boxLabel(writtenBoxes(sheet))} · {writtenCharacters(sheet).length} {writtenCharacters(sheet).length === 1 ? "character" : "characters"} practiced</span>{editable && <button onClick={() => setConfirmation("sheet")} disabled={emptyBoxes(sheet)}>Clear all ink</button>}</div>
      {sheet.status === "finished" && <button className="practice-button primary" onClick={() => { if (safeToLeave()) { replace(makeSheet(sheet.rows.map(({ character, pinyin, meaning }) => ({ character, pinyin, meaning })), sheet.layout, sheet.guides)); setSelected(null); setUndo([]); setRedo([]); setReview(false); } }}>Practice these characters again</button>}
    </>}
    <p className="practice-storage-note">Handwriting stays in this browser. Export a backup before clearing website data. Lesson progress is separate.</p>
    {confirmation && <div className="practice-modal-backdrop"><div className="practice-modal" role="alertdialog" aria-modal="true" aria-labelledby="clear-title"><h2 id="clear-title">Clear {confirmation === "box" ? "this box" : "all ink on this draft"}?</h2><p>{confirmation === "box" ? "The model and other boxes will stay." : "All handwriting on this draft will be removed. Finished sheets will stay."}</p><div><button className="practice-button" autoFocus onClick={() => setConfirmation(null)}>Keep writing</button><button className="practice-button primary" onClick={() => {
      if (confirmation === "box" && selected) updateBox(selected, []);
      else if (confirmation === "sheet" && current.current?.status === "draft") { replace({ ...current.current, lastSavedAt: new Date().toISOString(), rows: current.current.rows.map((row) => ({ ...row, boxes: row.boxes.map(() => []) })) }); setUndo([]); setRedo([]); }
      setConfirmation(null);
    }}>Clear ink</button></div></div></div>}
  </section>;
}
