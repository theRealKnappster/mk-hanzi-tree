import { drawInk } from "./ink";
import type { PracticeRow, PracticeSheet } from "./types";

const BOX = 200, MARGIN = 60, LABEL = 180, HEADER = 180, FOOTER = 70;
const HANZI_FONT = '"Kaiti SC", "STKaiti", "PingFang SC", serif';

function model(context: CanvasRenderingContext2D, row: PracticeRow, faint: boolean) {
  context.save();
  context.globalAlpha = faint ? 0.19 : 1;
  context.fillStyle = "#222222";
  if (row.reference) {
    context.translate(BOX * .08, BOX * .81828125);
    context.scale(BOX * .0008203125, -BOX * .0008203125);
    row.reference.strokes.forEach((path) => context.fill(new Path2D(path)));
  } else {
    context.font = `${BOX * .72}px ${HANZI_FONT}`;
    context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(row.character, BOX / 2, BOX / 2, BOX * .84);
  }
  context.restore();
}

// Render saved vectors directly: include the entire sheet, independently of scrolling,
// device resolution, dark mode, and toolbar state. No remote images can taint the canvas.
export async function renderSheetImage(sheet: PracticeSheet): Promise<Blob> {
  const columns = sheet.layout === "copybook" ? 7 : 6;
  const canvas = document.createElement("canvas");
  canvas.width = MARGIN * 2 + LABEL + columns * BOX;
  canvas.height = HEADER + sheet.rows.length * BOX + FOOTER;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create a practice image.");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#222222"; context.font = "bold 36px -apple-system, sans-serif";
  context.fillText("Hanzi writing practice", MARGIN, 65);
  context.font = "24px -apple-system, sans-serif";
  const date = sheet.practiceDate ? new Date(`${sheet.practiceDate}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "Not yet practiced";
  context.fillText(date, MARGIN, 105);
  context.fillStyle = "#666666"; context.font = "20px -apple-system, sans-serif";
  context.fillText(sheet.layout === "copybook" ? "Model · tracing practice · independent writing" : "Independent writing", MARGIN, 140);

  sheet.rows.forEach((row, rowIndex) => {
    const y = HEADER + rowIndex * BOX;
    context.save(); context.translate(MARGIN, y);
    context.fillStyle = "#222222"; context.textAlign = "center";
    if (row.reference) {
      context.save(); context.translate(LABEL / 2 - 36, 10); context.scale(.36, .36);
      model(context, row, false); context.restore();
    } else { context.font = `54px ${HANZI_FONT}`; context.fillText(row.character, LABEL / 2, 68); }
    context.font = "24px -apple-system, sans-serif"; context.fillText(row.pinyin, LABEL / 2, 105, LABEL - 18);
    context.fillStyle = "#666666"; context.font = "18px -apple-system, sans-serif";
    const words = row.meaning.split(/\s+/); let line = "", lineIndex = 0;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > LABEL - 20 && line) {
        context.fillText(line, LABEL / 2, 139 + lineIndex * 23, LABEL - 18);
        line = word; lineIndex++;
        if (lineIndex === 2) break;
      } else line = next;
    }
    if (lineIndex < 2) context.fillText(line, LABEL / 2, 139 + lineIndex * 23, LABEL - 18);
    context.restore();
    for (let column = 0; column < columns; column++) {
      context.save(); context.translate(MARGIN + LABEL + column * BOX, y);
      context.beginPath(); context.rect(0, 0, BOX, BOX); context.clip();
      if (sheet.guides) {
        context.strokeStyle = "#d8d8d8"; context.lineWidth = 1; context.setLineDash([6, 6]);
        context.beginPath(); context.moveTo(BOX / 2, 0); context.lineTo(BOX / 2, BOX);
        context.moveTo(0, BOX / 2); context.lineTo(BOX, BOX / 2); context.stroke(); context.setLineDash([]);
      }
      if (sheet.layout === "copybook" && column === 0) model(context, row, false);
      else {
        const box = column - (sheet.layout === "copybook" ? 1 : 0);
        if (sheet.layout === "copybook" && box < 3) model(context, row, true);
        drawInk(context, row.boxes[box], BOX, "#222222");
      }
      context.restore();
    }
  });
  context.strokeStyle = "#999999"; context.lineWidth = 1.5;
  context.beginPath();
  for (let row = 0; row <= sheet.rows.length; row++) {
    const y = HEADER + row * BOX;
    context.moveTo(MARGIN, y); context.lineTo(canvas.width - MARGIN, y);
  }
  for (const x of [MARGIN, ...Array.from({ length: columns + 1 }, (_, index) => MARGIN + LABEL + index * BOX)]) {
    context.moveTo(x, HEADER); context.lineTo(x, HEADER + sheet.rows.length * BOX);
  }
  context.stroke();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create a practice image. Please try again.")), "image/png"));
}
