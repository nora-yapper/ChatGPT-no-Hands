import type { Detector, DetectorContext, DetectorStatus } from "./Detector";
import type { NewInputEvent } from "@/events/types";
import type { Signals } from "@/types/signals";
import { combine, durationMargin, symmetryScore, clamp01 } from "./confidence";

/**
 * Both eyes closed → closure starts. On reopen the closure duration decides:
 * < blinkMinMs: noise, ignored; < longBlinkMs: BLINK; ≤ longBlinkMaxMs: LONG_BLINK; longer: resting, ignored.
 * Tracking loss during a closure discards it.
 */
export class BlinkDetector implements Detector {
  readonly name = "blink";
  private closedSince: number | null = null;
  private minOpenL = 1;
  private minOpenR = 1;
  private asymmetrySum = 0;
  private samples = 0;
  private last?: DetectorStatus["last"];
  private lastDuration = 0;
  private status: DetectorStatus = { name: this.name, active: false, progress: 0, durationMs: 0, phase: "open", thresholds: {} };

  reset() {
    this.closedSince = null;
    this.minOpenL = this.minOpenR = 1;
    this.asymmetrySum = 0;
    this.samples = 0;
  }

  update(s: Signals, ctx: DetectorContext): NewInputEvent[] {
    const th = ctx.thresholds;
    const out: NewInputEvent[] = [];
    if (!s.tracking) {
      this.reset();
      this.setStatus(false, 0, 0, "no tracking", th);
      return out;
    }
    const closed = s.leftEyeOpenness < th.eyeClosedThreshold && s.rightEyeOpenness < th.eyeClosedThreshold;
    const t = s.timestamp;

    if (closed) {
      if (this.closedSince === null) {
        this.closedSince = t;
        this.minOpenL = s.leftEyeOpenness;
        this.minOpenR = s.rightEyeOpenness;
        this.asymmetrySum = 0;
        this.samples = 0;
      }
      this.minOpenL = Math.min(this.minOpenL, s.leftEyeOpenness);
      this.minOpenR = Math.min(this.minOpenR, s.rightEyeOpenness);
      this.asymmetrySum += Math.abs(s.leftEyeOpenness - s.rightEyeOpenness);
      this.samples++;
      const dur = t - this.closedSince;
      const phase = dur > th.longBlinkMaxMs ? "resting (too long)" : dur >= th.longBlinkMs ? "long blink ready" : "closed";
      this.setStatus(true, clamp01(dur / th.longBlinkMs), dur, phase, th);
      return out;
    }

    if (this.closedSince !== null) {
      const dur = t - this.closedSince;
      this.lastDuration = dur;
      const depth = 1 - Math.max(this.minOpenL, this.minOpenR); // how firmly closed
      const symmetry = symmetryScore(this.minOpenL, this.minOpenR);
      const asym = this.samples ? this.asymmetrySum / this.samples : 0;
      const meta = { blinkStart: this.closedSince, blinkEnd: t, blinkDuration: dur, minOpennessL: this.minOpenL, minOpennessR: this.minOpenR, threshold: th.eyeClosedThreshold };
      if (dur >= th.blinkMinMs && dur <= th.longBlinkMaxMs) {
        const isLong = dur >= th.longBlinkMs;
        const confidence = combine(
          [
            [0.35, depth],
            [0.25, symmetry],
            [0.2, 1 - asym],
            [0.2, durationMargin(dur, th.longBlinkMs)],
          ],
          ctx.quality.overall,
        );
        const type = isLong ? "LONG_BLINK" : "BLINK";
        out.push({ type, timestamp: t, confidence, duration: dur, source: "eyes", metadata: { ...meta, longBlinkMs: th.longBlinkMs } });
        this.last = { type, confidence, at: t };
      }
      this.closedSince = null;
    }
    this.setStatus(false, 0, this.lastDuration, "open", th);
    return out;
  }

  private setStatus(active: boolean, progress: number, durationMs: number, phase: string, th: DetectorContext["thresholds"]) {
    this.status = {
      name: this.name,
      active,
      progress,
      durationMs,
      phase,
      thresholds: { eyeClosedThreshold: th.eyeClosedThreshold, longBlinkMs: th.longBlinkMs, blinkMinMs: th.blinkMinMs },
      last: this.last,
    };
  }

  getStatus() {
    return this.status;
  }
}
