import { useEffect, useRef, useState } from "react";
import type { Reference } from "./types";
import { REFERENCE_SOURCE } from "./types";

const models = new Map<string, Promise<Reference>>();
export function loadReference(character: string): Promise<Reference> {
  let promise = models.get(character);
  if (!promise) {
    promise = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(character)}.json`, { signal: controller.signal });
        if (!response.ok) throw new Error("No reference is available for this character.");
        const data = await response.json() as { strokes: string[]; medians: number[][][] };
        if (!Array.isArray(data.strokes) || !data.strokes.length || !data.strokes.every((stroke) => typeof stroke === "string") || !Array.isArray(data.medians) || data.medians.length !== data.strokes.length || !data.medians.every((median) => Array.isArray(median) && median.length > 0 && median.every((point) => Array.isArray(point) && point.length === 2 && point.every((value) => typeof value === "number" && Number.isFinite(value))))) throw new Error("Invalid character reference.");
        return { strokes: data.strokes, medians: data.medians, source: REFERENCE_SOURCE };
      } finally { window.clearTimeout(timeout); }
    })().catch((error) => { models.delete(character); throw error; });
    models.set(character, promise);
  }
  return promise;
}

export default function ModelCharacter({ character, reference, onLoad, onError, faint = false, steps = false, fetchMissing = true }: {
  character: string; reference?: Reference; onLoad?: (reference: Reference) => void; onError?: () => void; faint?: boolean; steps?: boolean; fetchMissing?: boolean;
}) {
  const [loaded, setLoaded] = useState<Reference | undefined>(reference);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onLoad, onError }); callbacks.current = { onLoad, onError };
  useEffect(() => {
    let cancelled = false; setFailed(false); setLoaded(reference);
    if (!reference && fetchMissing) loadReference(character).then((data) => { if (!cancelled) { setLoaded(data); callbacks.current.onLoad?.(data); } }).catch(() => { if (!cancelled) { setFailed(true); callbacks.current.onError?.(); } });
    return () => { cancelled = true; };
  }, [character, reference, fetchMissing]);
  if (!loaded) return <span className={`reference-fallback ${faint ? "faint" : ""}`} title={failed ? "Reference unavailable; displayed font is not a comparison model." : "Loading reference"}>{character}</span>;
  const paths = (count: number) => <svg viewBox="0 0 1000 1000" aria-label={`Reference character ${character}`} className={faint ? "faint" : ""}>
    <g transform="translate(80 818.28125) scale(0.8203125 -0.8203125)" fill="currentColor">{loaded.strokes.slice(0, count).map((path, index) => <path d={path} key={index} />)}</g>
  </svg>;
  if (steps) return <div className="construction-strip" aria-label={`Stroke construction for ${character}`}>{loaded.strokes.map((_, index) => <span key={index}>{paths(index + 1)}<small>{index + 1}</small></span>)}</div>;
  return paths(loaded.strokes.length);
}
