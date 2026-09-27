import type { NewInputEvent } from "@/events/types";
import type { Signals, TrackingQuality } from "@/types/signals";
import type { Thresholds } from "@/config/thresholds";

export interface DetectorContext {
  thresholds: Thresholds;
  quality: TrackingQuality;
}

/** Live status of a detector for the gesture debug panel. */
export interface DetectorStatus {
  name: string;
  /** currently inside a candidate gesture */
  active: boolean;
  /** 0..1 progress toward the gesture threshold (duration or amplitude) */
  progress: number;
  durationMs: number;
  /** short description of the current phase */
  phase: string;
  /** threshold(s) currently applied, for transparency */
  thresholds: Record<string, number>;
  /** last emitted event type + confidence, if any */
  last?: { type: string; confidence: number; at: number };
}

export interface Detector {
  readonly name: string;
  update(s: Signals, ctx: DetectorContext): NewInputEvent[];
  reset(): void;
  getStatus(): DetectorStatus;
}
