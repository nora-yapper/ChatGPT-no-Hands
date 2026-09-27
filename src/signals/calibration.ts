import type { CalibrationBaseline, Signals } from "@/types/signals";
import type { TrackingFrame } from "@/types/tracking";
import { rawFacial, rawHead } from "./normalizeSignals";

/** Default baseline used when the user has not calibrated yet. */
export const DEFAULT_BASELINE: CalibrationBaseline = {
  capturedAt: 0,
  sampleCount: 0,
  headX: 0.5,
  headY: 0.5,
  headYawDeg: 0,
  headPitchDeg: 0,
  headRollDeg: 0,
  leftEyeOpen: 1,
  rightEyeOpen: 1,
  jawOpen: 0,
  leftBrow: 0,
  rightBrow: 0,
  browFurrow: 0,
  smile: 0,
};

/** Accumulates frames over a capture window and averages them into a baseline. */
export class CalibrationSession {
  private sums: Record<keyof Omit<CalibrationBaseline, "capturedAt" | "sampleCount">, number> = {
    headX: 0, headY: 0, headYawDeg: 0, headPitchDeg: 0, headRollDeg: 0,
    leftEyeOpen: 0, rightEyeOpen: 0, jawOpen: 0, leftBrow: 0, rightBrow: 0, browFurrow: 0, smile: 0,
  };
  private count = 0;
  readonly startedAt: number;
  readonly durationMs: number;

  constructor(startedAt: number, durationMs = 2000) {
    this.startedAt = startedAt;
    this.durationMs = durationMs;
  }

  progress(now: number): number {
    return Math.min(1, (now - this.startedAt) / this.durationMs);
  }

  isComplete(now: number): boolean {
    return now - this.startedAt >= this.durationMs;
  }

  addFrame(frame: TrackingFrame) {
    if (!frame.faceDetected) return;
    const head = rawHead(frame);
    const f = rawFacial(frame);
    if (!head) return;
    this.sums.headX += head.headX;
    this.sums.headY += head.headY;
    this.sums.headYawDeg += head.yawDeg;
    this.sums.headPitchDeg += head.pitchDeg;
    this.sums.headRollDeg += head.rollDeg;
    this.sums.leftEyeOpen += f.leftEyeOpen;
    this.sums.rightEyeOpen += f.rightEyeOpen;
    this.sums.jawOpen += f.jawOpen;
    this.sums.leftBrow += f.leftBrow;
    this.sums.rightBrow += f.rightBrow;
    this.sums.browFurrow += f.browFurrow;
    this.sums.smile += f.smile;
    this.count++;
  }

  get sampleCount() {
    return this.count;
  }

  finish(now: number): CalibrationBaseline | null {
    if (this.count < 5) return null;
    const n = this.count;
    return {
      capturedAt: now,
      sampleCount: n,
      headX: this.sums.headX / n,
      headY: this.sums.headY / n,
      headYawDeg: this.sums.headYawDeg / n,
      headPitchDeg: this.sums.headPitchDeg / n,
      headRollDeg: this.sums.headRollDeg / n,
      leftEyeOpen: Math.max(0.2, this.sums.leftEyeOpen / n),
      rightEyeOpen: Math.max(0.2, this.sums.rightEyeOpen / n),
      jawOpen: this.sums.jawOpen / n,
      leftBrow: this.sums.leftBrow / n,
      rightBrow: this.sums.rightBrow / n,
      browFurrow: this.sums.browFurrow / n,
      smile: this.sums.smile / n,
    };
  }
}

/** Helper for the UI: the pointer/head signals of a "perfectly neutral" user. */
export function neutralSignals(timestamp: number): Signals {
  return {
    timestamp,
    tracking: false,
    headX: 0.5, headY: 0.5,
    headYaw: 0, headPitch: 0, headRoll: 0,
    headYawDeg: 0, headPitchDeg: 0, headRollDeg: 0,
    headPoseFromMatrix: false,
    eyeX: 0, eyeY: 0,
    pointerX: 0.5, pointerY: 0.5, pointerSource: "head",
    leftEyeOpenness: 1, rightEyeOpenness: 1, leftBlink: 0, rightBlink: 0,
    leftSquint: 0, rightSquint: 0,
    mouthOpenness: 0, jawOpen: 0,
    leftBrowRaise: 0, rightBrowRaise: 0, browFurrow: 0, smile: 0,
  };
}
