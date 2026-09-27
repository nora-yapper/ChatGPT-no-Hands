/**
 * Heuristic confidence helpers. These are NOT calibrated probabilities; they combine
 * signal strength, duration margin, symmetry, stability and tracking quality into a 0..1
 * number so events can be compared and filtered. Always labelled "heuristic" in the UI.
 */
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** How far a value exceeds a threshold, saturating at 2x the threshold. */
export function strengthScore(value: number, threshold: number): number {
  if (threshold <= 0) return clamp01(value);
  return clamp01((value - threshold) / threshold);
}

/** How far a duration is from a boundary, relative to the boundary (0 at the boundary, 1 at 2x away). */
export function durationMargin(durationMs: number, boundaryMs: number): number {
  if (boundaryMs <= 0) return 1;
  return clamp01(Math.abs(durationMs - boundaryMs) / boundaryMs);
}

export function symmetryScore(a: number, b: number): number {
  return clamp01(1 - Math.abs(a - b));
}

export function combine(parts: Array<[weight: number, score: number]>, quality: number): number {
  let wsum = 0;
  let acc = 0;
  for (const [w, s] of parts) {
    wsum += w;
    acc += w * clamp01(s);
  }
  const base = wsum > 0 ? acc / wsum : 0;
  return clamp01(base * (0.5 + 0.5 * clamp01(quality)));
}
