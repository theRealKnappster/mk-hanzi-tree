import { useEffect, useRef } from "react";
import { drawInk, inkPoint, strokeWidth } from "./ink";
import type { InkPoint, InkStroke } from "./types";

type Props = {
  strokes: InkStroke[];
  label: string;
  readOnly?: boolean;
  inputMode?: "pencil" | "finger";
  tool?: "brush" | "pen" | "eraser";
  sensitivity?: number;
  onChange?: (strokes: InkStroke[]) => void;
  onSelect?: () => void;
};

type PencilTouch = Touch & { touchType?: "stylus" | "direct" };

export default function InkBox(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const paint = useRef<() => void>(() => undefined);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    let active: { kind: "pointer" | "touch"; id: number; stroke: InkStroke; start: number; erasing: boolean } | null = null;
    let size = 0;
    let erased = new Set<string>();
    let frame = 0;

    const repaint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      size = element.getBoundingClientRect().width;
      if (!size) return;
      const pixels = Math.round(size * dpr);
      if (element.width !== pixels || element.height !== pixels) { element.width = pixels; element.height = pixels; }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, size, size);
      const strokes = latest.current.strokes.filter((stroke) => !erased.has(stroke.id));
      if (active && !active.erasing) strokes.push(active.stroke);
      drawInk(context, strokes, size, getComputedStyle(element).color);
    };
    paint.current = repaint;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; repaint(); }); };
    const finish = () => {
      if (!active) return;
      const gesture = active; active = null;
      if (gesture.erasing) {
        if (erased.size) latest.current.onChange?.(latest.current.strokes.filter((stroke) => !erased.has(stroke.id)));
      } else if (gesture.stroke.points.length) latest.current.onChange?.([...latest.current.strokes, gesture.stroke]);
      erased = new Set(); schedule();
    };
    const eraseAt = (point: InkPoint) => {
      // Hit-test segments, including their pressure width, so fast strokes can be erased between samples.
      for (const stroke of latest.current.strokes) {
        for (let index = 0; index < stroke.points.length; index++) {
          const b = stroke.points[index], a = stroke.points[Math.max(0, index - 1)];
          const dx = b.x - a.x, dy = b.y - a.y;
          const lengthSquared = dx * dx + dy * dy;
          const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
          const inkRadius = Math.max(strokeWidth(a.pressure, stroke), strokeWidth(b.pressure, stroke)) / 2;
          if (Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) < 0.035 + inkRadius) { erased.add(stroke.id); break; }
        }
      }
    };
    const add = (x: number, y: number, pressure: number) => {
      if (!active) return;
      const point = inkPoint(x, y, pressure, performance.now() - active.start, element.getBoundingClientRect());
      if (active.erasing) eraseAt(point);
      else {
        const previous = active.stroke.points.at(-1);
        if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.001 || Math.abs(point.pressure - previous.pressure) > 0.005) active.stroke.points.push(point);
      }
      schedule();
    };
    const begin = (kind: "pointer" | "touch", id: number, x: number, y: number, pressure: number) => {
      if (latest.current.readOnly || active) return false;
      latest.current.onSelect?.();
      const style = latest.current.tool === "brush" ? "brush" : "pen";
      active = { kind, id, stroke: { id: crypto.randomUUID(), startedAt: new Date().toISOString(), points: [], style, ...(style === "brush" ? { sensitivity: latest.current.sensitivity ?? 2 } : {}) }, start: performance.now(), erasing: latest.current.tool === "eraser" };
      add(x, y, pressure); return true;
    };
    const down = (event: PointerEvent) => {
      // Safari touch events identify Apple Pencil reliably. Let them own touch-type pointer input.
      if (event.pointerType === "touch" || (event.pointerType === "mouse" && event.button !== 0)) return;
      if (begin("pointer", event.pointerId, event.clientX, event.clientY, event.pointerType === "pen" ? event.pressure : 0.35)) {
        event.preventDefault();
        try { element.setPointerCapture(event.pointerId); } catch { /* A cancelled pointer may already have lost capture. */ }
      }
    };
    const move = (event: PointerEvent) => {
      if (!active || active.kind !== "pointer" || active.id !== event.pointerId) return;
      if (event.pointerType === "mouse" && !event.buttons) { finish(); return; }
      event.preventDefault();
      const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      for (const sample of samples.length ? samples : [event]) add(sample.clientX, sample.clientY, sample.pointerType === "pen" ? sample.pressure : 0.35);
    };
    const up = (event: PointerEvent) => {
      if (active?.kind === "pointer" && active.id === event.pointerId) {
        event.preventDefault(); finish();
        if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      }
    };
    const touchStart = (event: TouchEvent) => {
      if (active || latest.current.readOnly) return;
      const touches = Array.from(event.changedTouches) as PencilTouch[];
      const touch = touches.find((touch) => touch.touchType === "stylus") || (latest.current.inputMode === "finger" && event.touches.length === 1 ? touches[0] : undefined);
      if (touch && begin("touch", touch.identifier, touch.clientX, touch.clientY, touch.touchType === "stylus" ? touch.force : 0.35)) event.preventDefault();
    };
    const touchMove = (event: TouchEvent) => {
      if (active?.kind !== "touch") return;
      const touch = (Array.from(event.changedTouches) as PencilTouch[]).find((touch) => touch.identifier === active?.id);
      if (touch) { event.preventDefault(); add(touch.clientX, touch.clientY, touch.touchType === "stylus" ? touch.force : 0.35); }
    };
    const touchEnd = (event: TouchEvent) => {
      if (active?.kind === "touch" && Array.from(event.changedTouches).some((touch) => touch.identifier === active?.id)) { event.preventDefault(); finish(); }
    };
    const lost = (event: PointerEvent) => { if (active?.kind === "pointer" && active.id === event.pointerId) finish(); };
    const visibility = () => { if (document.hidden) finish(); };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("lostpointercapture", lost);
    element.addEventListener("touchstart", touchStart, { passive: false });
    element.addEventListener("touchmove", touchMove, { passive: false });
    element.addEventListener("touchend", touchEnd, { passive: false });
    element.addEventListener("touchcancel", touchEnd, { passive: false });
    window.addEventListener("blur", finish);
    document.addEventListener("visibilitychange", visibility);
    const resize = new ResizeObserver(() => { finish(); repaint(); }); resize.observe(element);
    repaint();
    return () => {
      finish(); cancelAnimationFrame(frame); resize.disconnect();
      element.removeEventListener("pointerdown", down); element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up); element.removeEventListener("pointercancel", up); element.removeEventListener("lostpointercapture", lost);
      element.removeEventListener("touchstart", touchStart); element.removeEventListener("touchmove", touchMove);
      element.removeEventListener("touchend", touchEnd); element.removeEventListener("touchcancel", touchEnd);
      window.removeEventListener("blur", finish); document.removeEventListener("visibilitychange", visibility);
      paint.current = () => undefined;
    };
  }, []);

  useEffect(() => { paint.current(); });
  return <canvas ref={canvas} className={`practice-ink ${props.readOnly ? "read-only" : ""}`} aria-label={props.label} role="img" onClick={props.onSelect} />;
}
