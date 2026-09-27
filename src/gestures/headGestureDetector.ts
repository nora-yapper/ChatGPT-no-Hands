import type { Detector, DetectorContext, DetectorStatus } from "./Detector";
import type { NewInputEvent } from "@/events/types";
import type { Signals } from "@/types/signals";
import { combine, strengthScore, clamp01 } from "./confidence";

type Phase = "idle" | "excursion" | "return" | "refractory";

/**
 * Temporal head-gesture recognizer shared by NOD (pitch axis, single excursion DOWN → back)
 * and HEAD_SHAKE (yaw axis, excursion one way → opposite way → back).
 * A gesture must START near neutral, so a head that merely rests below centre never nods.
 */
export class HeadGestureDetector implements Detector {
  readonly name: string;
  private phase: Phase = "idle";
  private startAt = 0;
  private firstSign = 0;
  private peak = 0;
  private secondPeak = 0;
  private sawOpposite = false;
  private refractoryUntil = 0;
  private last?: DetectorStatus["last"];
  private status: DetectorStatus;

  constructor(private readonly kind: "NOD" | "HEAD_SHAKE") {
    this.name = kind === "NOD" ? "nod" : "shake";
    this.status = { name: this.name, active: false, progress: 0, durationMs: 0, phase: "idle", thresholds: {} };
  }

  reset() {
    this.phase = "idle";
    this.sawOpposite = false;
    this.peak = this.secondPeak = 0;
  }

  private params(th: DetectorContext["thresholds"]) {
    return this.kind === "NOD"
      ? { threshold: th.nodThreshold, maxMs: th.nodMaxDurationMs }
      : { threshold: th.shakeThreshold, maxMs: th.shakeMaxDurationMs };
  }

  update(s: Signals, ctx: DetectorContext): NewInputEvent[] {
    const th = ctx.thresholds;
    const { threshold, maxMs } = this.params(th);
    const out: NewInputEvent[] = [];
    const t = s.timestamp;
    const v = this.kind === "NOD" ? s.headPitch : s.headYaw;
    const centerTol = Math.min(th.gestureCenterTolerance, threshold * 0.6);

    if (!s.tracking) {
      this.reset();
      this.set(false, 0, 0, "no tracking", threshold, maxMs);
      return out;
    }

    if (this.phase === "refractory") {
      if (t >= this.refractoryUntil) this.phase = "idle";
      else {
        this.set(false, 0, 0, "refractory", threshold, maxMs);
        return out;
      }
    }

    if (this.phase === "idle") {
      // Nod: require a DOWN excursion (negative pitch). Shake: either direction first.
      const exceeded = this.kind === "NOD" ? v <= -threshold : Math.abs(v) >= threshold;
      const nearCenter = Math.abs(v) <= centerTol;
      if (nearCenter) this.lastCenterAt = t;
      const recentlyCentered = t - this.lastCenterAt <= maxMs * 0.5;
      if (exceeded && recentlyCentered) {
        this.phase = "excursion";
        this.startAt = t;
        this.firstSign = Math.sign(v);
        this.peak = Math.abs(v);
        this.secondPeak = 0;
        this.sawOpposite = false;
      }
      this.set(false, clamp01(Math.abs(v) / threshold), 0, nearCenter ? "center" : recentlyCentered ? "leaving center" : "off-center", threshold, maxMs);
      return out;
    }

    // in a gesture
    const dur = t - this.startAt;
    if (dur > maxMs) {
      this.phase = "idle";
      this.lastCenterAt = -Infinity;
      this.set(false, 0, dur, "timed out", threshold, maxMs);
      return out;
    }

    if (Math.sign(v) === this.firstSign) this.peak = Math.max(this.peak, Math.abs(v));

    if (this.kind === "HEAD_SHAKE") {
      if (Math.sign(v) === -this.firstSign && Math.abs(v) >= threshold) {
        this.sawOpposite = true;
        this.secondPeak = Math.max(this.secondPeak, Math.abs(v));
      }
      const returned = this.sawOpposite && Math.abs(v) <= threshold * 0.5;
      if (returned) {
        const confidence = combine(
          [
            [0.35, strengthScore(this.peak, threshold)],
            [0.35, strengthScore(this.secondPeak, threshold)],
            [0.3, 1 - dur / maxMs],
          ],
          ctx.quality.overall,
        );
        out.push({ type: "HEAD_SHAKE", timestamp: t, confidence, duration: dur, source: "head", metadata: { peak: this.peak, secondPeak: this.secondPeak, threshold, maxMs } });
        this.finish(t, th.gestureRefractoryMs, "HEAD_SHAKE", confidence);
        this.set(false, 1, dur, "detected", threshold, maxMs);
        return out;
      }
      this.set(true, this.sawOpposite ? 0.9 : 0.5, dur, this.sawOpposite ? "returning" : "first excursion", threshold, maxMs);
      return out;
    }

    // NOD: returned to (or above) centre after a down excursion
    const returned = v >= -threshold * 0.4;
    if (returned) {
      const confidence = combine(
        [
          [0.5, strengthScore(this.peak, threshold)],
          [0.3, 1 - dur / maxMs],
          [0.2, 1 - Math.abs(s.headYaw)], // little sideways movement
        ],
        ctx.quality.overall,
      );
      out.push({ type: "NOD", timestamp: t, confidence, duration: dur, source: "head", metadata: { peak: this.peak, threshold, maxMs } });
      this.finish(t, th.gestureRefractoryMs, "NOD", confidence);
      this.set(false, 1, dur, "detected", threshold, maxMs);
      return out;
    }
    this.set(true, 0.6, dur, "down excursion", threshold, maxMs);
    return out;
  }

  private lastCenterAt = -Infinity;

  private finish(t: number, refractoryMs: number, type: string, confidence: number) {
    this.phase = "refractory";
    this.refractoryUntil = t + refractoryMs;
    this.lastCenterAt = -Infinity;
    this.last = { type, confidence, at: t };
  }

  private set(active: boolean, progress: number, durationMs: number, phase: string, threshold: number, maxMs: number) {
    this.status = { name: this.name, active, progress, durationMs, phase, thresholds: { threshold, maxDurationMs: maxMs }, last: this.last };
  }

  getStatus() {
    return this.status;
  }
}
