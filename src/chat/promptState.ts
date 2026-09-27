import { appendToPrompt } from "./predictionRules";

/**
 * How the prompt was built, one segment per user decision. The canonical prompt is always derived
 * from this list, so undo is "drop the last segment" and predicted vs. typed input stays distinguishable.
 */
export interface Segment {
  text: string;
  source: "prediction" | "keyboard";
  type: "starter" | "word" | "phrase" | "manual";
  /** when the segment was added (performance.now()); identifies this particular choice */
  at?: number;
}

export function buildPrompt(segments: Segment[]): string {
  return segments.reduce((acc, s) => appendToPrompt(acc, s.text), "");
}

export function pushSegment(segments: Segment[], segment: Segment): Segment[] {
  return segment.text.trim() ? [...segments, { at: performance.now(), ...segment, text: segment.text.trim() }] : segments;
}

/** Remove only the most recent segment (predicted or typed). */
export function undoSegment(segments: Segment[]): Segment[] {
  return segments.slice(0, -1);
}
