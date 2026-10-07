import type { InkPoint, InkStroke, Reference } from "./types";

export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const pressureWidth = (pressure: number) => 0.007 + 0.038 * Math.pow(clamp(pressure), 0.7);
// Brush ink uses a wider range and reaches full width with comfortable pressure.
// Missing style means the original pen, keeping older sheets visually unchanged.
export const strokeWidth = (pressure: number, stroke: Pick<InkStroke, "style" | "sensitivity">) => stroke.style === "brush"
  ? 0.0025 + 0.12 * Math.pow(clamp(pressure * clamp(stroke.sensitivity ?? 2, 1, 3)), 1.15)
  : pressureWidth(pressure);

export function inkPoint(clientX: number, clientY: number, pressure: number, elapsed: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): InkPoint {
  return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height), pressure: clamp(pressure), time: Math.max(0, elapsed) };
}

// Store raw pressure; smooth only the displayed width. Redrawing uses exactly the same algorithm.
export function drawInk(context: CanvasRenderingContext2D, strokes: InkStroke[], size: number, color: string) {
  context.fillStyle = color;
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    let previous = stroke.points[0];
    let radius = strokeWidth(previous.pressure, stroke) * size / 2;
    const stamp = (x: number, y: number, r: number) => {
      context.beginPath(); context.arc(x * size, y * size, r, 0, Math.PI * 2); context.fill();
    };
    stamp(previous.x, previous.y, radius);
    for (let index = 1; index < stroke.points.length; index++) {
      const point = stroke.points[index];
      const nextRadius = radius * 0.3 + strokeWidth(point.pressure, stroke) * size / 2 * 0.7;
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y) * size;
      const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, Math.min(radius, nextRadius) * 0.5)));
      for (let step = 1; step <= steps; step++) {
        const fraction = step / steps;
        stamp(previous.x + (point.x - previous.x) * fraction, previous.y + (point.y - previous.y) * fraction, radius + (nextRadius - radius) * fraction);
      }
      radius = nextRadius; previous = point;
    }
  }
}

// Hanzi Writer's native coordinate bounds are x: 0..1024, y: -124..900.
// Match its positioning with 8% padding, and never rescale the learner's ink to fit the model.
export const modelPoint = (point: number[]) => ({ x: 0.08 + point[0] / 1024 * 0.84, y: 0.08 + (900 - point[1]) / 1024 * 0.84 });

type Bounds = { left: number; top: number; right: number; bottom: number; width: number; height: number; cx: number; cy: number };
function bounds(points: { x: number; y: number }[]): Bounds | null {
  if (!points.length) return null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const point of points) { left = Math.min(left, point.x); right = Math.max(right, point.x); top = Math.min(top, point.y); bottom = Math.max(bottom, point.y); }
  return { left, right, top, bottom, width: right - left, height: bottom - top, cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

export type Observation = { text: string; axis?: "x" | "y"; region?: Bounds };
export function compareInk(strokes: InkStroke[], reference: Reference): Observation[] {
  const learner = bounds(strokes.flatMap((stroke) => stroke.points));
  const model = bounds(reference.medians.flatMap((median) => median.map(modelPoint)));
  if (!learner || !model) return [];
  const notes: Observation[] = [];
  const count = strokes.filter((stroke) => stroke.points.length).length;
  if (count !== reference.medians.length) notes.push({ text: `You made ${count} pen strokes; the model uses ${reference.medians.length}. Check for an extra lift, a missing stroke, or a different stroke convention.` });
  if (Math.abs(learner.cx - model.cx) > 0.075) notes.push({ text: `Your writing sits farther ${learner.cx < model.cx ? "left" : "right"} in the box than the model.`, axis: "x", region: learner });
  if (Math.abs(learner.cy - model.cy) > 0.075) notes.push({ text: `Your writing sits ${learner.cy < model.cy ? "higher" : "lower"} in the box than the model.`, axis: "y", region: learner });
  if (learner.width - model.width > 0.1) notes.push({ text: "Your writing spans more of the box's width than the model.", axis: "x", region: learner });
  else if (model.width - learner.width > 0.1) notes.push({ text: "Your writing spans less of the box's width than the model.", axis: "x", region: learner });
  if (learner.height - model.height > 0.1) notes.push({ text: "Your writing spans more of the box's height than the model.", axis: "y", region: learner });
  else if (model.height - learner.height > 0.1) notes.push({ text: "Your writing spans less of the box's height than the model.", axis: "y", region: learner });
  if (!notes.length) notes.push({ text: "The overall placement and size are close to the model. Look at the overlay for differences inside the character." });
  return notes;
}
