import type { Detector, DetectorContext, DetectorStatus } from "./Detector";
import type { NewInputEvent } from "@/events/types";
import type { Signals } from "@/types/signals";
import { combine, strengthScore, clamp01 } from "./confidence";

/** Head turned far from the screen for lookAwayMs → LOOK_AWAY (informational unless bound). */
export class LookAwayDetector implements Detector {
  readonly name = "lookAway";
  private awaySince: number | null = null;
  private emitted = false;
  private last?: DetectorStatus["last"];
  private status: DetectorStatus = { name: this.name, active: false, progress: 0, durationMs: 0, phase: "facing", thresholds: {} };

  reset() {
    this.awaySince = null;
    this.emitted = false;
  }

  update(s: Signals, ctx: DetectorContext): NewInputEvent[] {
    const th = ctx.thresholds;
    const out: NewInputEvent[] = [];
    const t = s.timestamp;
    if (!s.tracking) {
      this.reset();
      this.set(false, 0, 0, "no tracking", th);
      return out;
    }
    const mag = Math.max(Math.abs(s.headYaw), Math.abs(s.headPitch));
    if (mag < th.lookAwayThreshold) {
      this.awaySince = null;
      this.emitted = false;
      this.set(false, clamp01(mag / th.lookAwayThreshold), 0, "facing screen", th);
      return out;
    }
    if (this.awaySince === null) this.awaySince = t;
    const dur = t - this.awaySince;
    if (!this.emitted && dur >= th.lookAwayMs) {
      this.emitted = true;
      const confidence = combine([[1, strengthScore(mag, th.lookAwayThreshold)]], ctx.quality.overall);
      out.push({ type: "LOOK_AWAY", timestamp: t, confidence, duration: dur, source: "head", metadata: { yaw: s.headYaw, pitch: s.headPitch, threshold: th.lookAwayThreshold } });
      this.last = { type: "LOOK_AWAY", confidence, at: t };
    }
    this.set(true, clamp01(dur / th.lookAwayMs), dur, this.emitted ? "away" : "turning away", th);
    return out;
  }

  private set(active: boolean, progress: number, durationMs: number, phase: string, th: DetectorContext["thresholds"]) {
    this.status = { name: this.name, active, progress, durationMs, phase, thresholds: { lookAwayThreshold: th.lookAwayThreshold, lookAwayMs: th.lookAwayMs }, last: this.last };
  }

  getStatus() {
    return this.status;
  }
}
