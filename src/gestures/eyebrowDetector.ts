import type { Detector, DetectorContext, DetectorStatus } from "./Detector";
import type { NewInputEvent } from "@/events/types";
import type { Signals } from "@/types/signals";
import { combine, strengthScore, symmetryScore, clamp01 } from "./confidence";

/** Brow raise held for browMinMs → BROW_RAISE_LEFT / RIGHT / BOTH (one event per raise episode). */
export class EyebrowDetector implements Detector {
  readonly name = "brows";
  private raisedSince: number | null = null;
  private emitted = false;
  private last?: DetectorStatus["last"];
  private status: DetectorStatus = { name: this.name, active: false, progress: 0, durationMs: 0, phase: "neutral", thresholds: {} };

  reset() {
    this.raisedSince = null;
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
    const l = s.leftBrowRaise >= th.browRaiseThreshold;
    const r = s.rightBrowRaise >= th.browRaiseThreshold;
    if (!l && !r) {
      this.raisedSince = null;
      this.emitted = false;
      this.set(false, clamp01(Math.max(s.leftBrowRaise, s.rightBrowRaise) / th.browRaiseThreshold), 0, "neutral", th);
      return out;
    }
    if (this.raisedSince === null) this.raisedSince = t;
    const dur = t - this.raisedSince;
    if (!this.emitted && dur >= th.browMinMs) {
      this.emitted = true;
      const type = l && r ? "BROW_RAISE_BOTH" : l ? "BROW_RAISE_LEFT" : "BROW_RAISE_RIGHT";
      const confidence = combine(
        [
          [0.6, strengthScore(Math.max(s.leftBrowRaise, s.rightBrowRaise), th.browRaiseThreshold)],
          [0.4, l && r ? symmetryScore(s.leftBrowRaise, s.rightBrowRaise) : 1 - Math.min(s.leftBrowRaise, s.rightBrowRaise)],
        ],
        ctx.quality.overall,
      );
      out.push({ type, timestamp: t, confidence, duration: dur, source: "face", metadata: { left: s.leftBrowRaise, right: s.rightBrowRaise, threshold: th.browRaiseThreshold, minMs: th.browMinMs } });
      this.last = { type, confidence, at: t };
    }
    this.set(true, clamp01(dur / th.browMinMs), dur, this.emitted ? "raised (emitted)" : l && r ? "both rising" : l ? "left rising" : "right rising", th);
    return out;
  }

  private set(active: boolean, progress: number, durationMs: number, phase: string, th: DetectorContext["thresholds"]) {
    this.status = { name: this.name, active, progress, durationMs, phase, thresholds: { browRaiseThreshold: th.browRaiseThreshold, browMinMs: th.browMinMs }, last: this.last };
  }

  getStatus() {
    return this.status;
  }
}
