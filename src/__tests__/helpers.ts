import { neutralSignals } from "@/signals/calibration";
import { DEFAULT_THRESHOLDS } from "@/config/thresholds";
import type { Signals, TrackingQuality } from "@/types/signals";
import type { DetectorContext } from "@/gestures/Detector";

export const GOOD_QUALITY: TrackingQuality = {
  faceDetected: true, faceSize: "GOOD", inFrame: "GOOD", motion: "GOOD", latency: "GOOD", landmarks: "GOOD", headPose: "GOOD", overall: 0.9, issues: [],
};

export const ctx = (): DetectorContext => ({ thresholds: DEFAULT_THRESHOLDS, quality: GOOD_QUALITY });

export function sig(t: number, patch: Partial<Signals> = {}): Signals {
  return { ...neutralSignals(t), tracking: true, ...patch };
}

/** Generates a sequence of signals at `stepMs` from a function of time. */
export function sequence(fromMs: number, toMs: number, stepMs: number, f: (t: number) => Partial<Signals>): Signals[] {
  const out: Signals[] = [];
  for (let t = fromMs; t <= toMs; t += stepMs) out.push(sig(t, f(t)));
  return out;
}
