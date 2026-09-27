import type { Detector, DetectorContext, DetectorStatus } from "./Detector";
import type { HeadPoseGestureType, NewInputEvent } from "@/events/types";
import type { Signals } from "@/types/signals";
import { combine, strengthScore, clamp01 } from "./confidence";

/** the head must come back within this fraction of the threshold before the next gesture can fire */
const REARM_FRACTION = 0.45;

/**
 * Held head-pose gestures: turn (yaw), tilt (pitch) or roll the head past `headGestureThreshold` of the head
 * range and hold it for `headGestureHoldMs` → one TURN_* / TILT_* / ROLL_* event. Only the dominant axis
 * counts, and nothing more fires until the head has come back near centre, so one movement is one gesture.
 * Signs follow Signals: yaw + = the user turns to their right, pitch + = up, roll + = toward the right shoulder.
 */
export class HeadPoseGestureDetector implements Detector {
  readonly name = "headPose";
  private candidate: HeadPoseGestureType | null = null;
  private since = 0;
  /** fired, waiting for the head to return near centre */
  private spent = false;
  private last?: DetectorStatus["last"];
  private status: DetectorStatus = { name: this.name, active: false, progress: 0, durationMs: 0, phase: "centre", thresholds: {} };

  reset() {
    this.candidate = null;
    this.spent = false;
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
    const axes: Array<[number, HeadPoseGestureType, HeadPoseGestureType]> = [
      [s.headYaw, "TURN_RIGHT", "TURN_LEFT"],
      [s.headPitch, "TILT_UP", "TILT_DOWN"],
      [s.headRoll, "ROLL_RIGHT", "ROLL_LEFT"],
    ];
    const [value, pos, neg] = axes.reduce((a, b) => (Math.abs(b[0]) > Math.abs(a[0]) ? b : a));
    const mag = Math.abs(value);

    if (this.spent) {
      if (mag < th.headGestureThreshold * REARM_FRACTION) this.spent = false;
      this.set(!this.spent, 1, 0, this.spent ? "return to centre" : "centre", th);
      return out;
    }
    const dir = mag >= th.headGestureThreshold ? (value > 0 ? pos : neg) : null;
    if (!dir) {
      this.candidate = null;
      this.set(false, clamp01(mag / th.headGestureThreshold), 0, "centre", th);
      return out;
    }
    if (dir !== this.candidate) {
      this.candidate = dir;
      this.since = t;
    }
    const dur = t - this.since;
    if (dur >= th.headGestureHoldMs) {
      const confidence = combine([[1, strengthScore(mag, th.headGestureThreshold)]], ctx.quality.overall);
      out.push({ type: dir, timestamp: t, confidence, duration: dur, source: "head", metadata: { magnitude: mag, threshold: th.headGestureThreshold, holdMs: th.headGestureHoldMs } });
      this.last = { type: dir, confidence, at: t };
      this.spent = true;
      this.candidate = null;
    }
    this.set(true, clamp01(dur / th.headGestureHoldMs), dur, `holding ${dir}`, th);
    return out;
  }

  private set(active: boolean, progress: number, durationMs: number, phase: string, th: DetectorContext["thresholds"]) {
    this.status = { name: this.name, active, progress, durationMs, phase, thresholds: { headGestureThreshold: th.headGestureThreshold, headGestureHoldMs: th.headGestureHoldMs }, last: this.last };
  }

  getStatus() {
    return this.status;
  }
}
