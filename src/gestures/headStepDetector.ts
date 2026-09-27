import type { Detector, DetectorContext, DetectorStatus } from "./Detector";
import type { NewInputEvent } from "@/events/types";
import type { Signals } from "@/types/signals";
import { combine, strengthScore, clamp01 } from "./confidence";

export type StepDirection = "LEFT" | "RIGHT" | "UP" | "DOWN";

/** Discrete navigation: holding the head past headStepThreshold emits HEAD_STEP, repeating every headStepRepeatMs. */
export class HeadStepDetector implements Detector {
  readonly name = "headStep";
  private dir: StepDirection | null = null;
  private nextAt = 0;
  private last?: DetectorStatus["last"];
  private status: DetectorStatus = { name: this.name, active: false, progress: 0, durationMs: 0, phase: "center", thresholds: {} };

  reset() {
    this.dir = null;
  }

  update(s: Signals, ctx: DetectorContext): NewInputEvent[] {
    const th = ctx.thresholds;
    const out: NewInputEvent[] = [];
    const t = s.timestamp;
    if (!s.tracking) {
      this.reset();
      this.set(false, 0, "no tracking", th);
      return out;
    }
    let dir: StepDirection | null = null;
    let mag = 0;
    if (Math.abs(s.headYaw) >= Math.abs(s.headPitch)) {
      mag = Math.abs(s.headYaw);
      if (mag >= th.headStepThreshold) dir = s.headYaw > 0 ? "RIGHT" : "LEFT";
    } else {
      mag = Math.abs(s.headPitch);
      if (mag >= th.headStepThreshold) dir = s.headPitch > 0 ? "UP" : "DOWN";
    }
    if (!dir) {
      this.dir = null;
      this.set(false, clamp01(mag / th.headStepThreshold), "center", th);
      return out;
    }
    if (dir !== this.dir || t >= this.nextAt) {
      this.dir = dir;
      this.nextAt = t + th.headStepRepeatMs;
      const confidence = combine([[1, strengthScore(mag, th.headStepThreshold)]], ctx.quality.overall);
      out.push({ type: "HEAD_STEP", timestamp: t, confidence, source: "head", metadata: { direction: dir, magnitude: mag, threshold: th.headStepThreshold } });
      this.last = { type: `HEAD_STEP ${dir}`, confidence, at: t };
    }
    this.set(true, clamp01(1 - (this.nextAt - t) / th.headStepRepeatMs), dir, th);
    return out;
  }

  private set(active: boolean, progress: number, phase: string, th: DetectorContext["thresholds"]) {
    this.status = { name: this.name, active, progress, durationMs: 0, phase, thresholds: { headStepThreshold: th.headStepThreshold, repeatMs: th.headStepRepeatMs }, last: this.last };
  }

  getStatus() {
    return this.status;
  }
}
