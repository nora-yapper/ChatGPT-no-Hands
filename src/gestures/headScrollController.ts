import type { Signals } from "@/types/signals";
import type { Thresholds } from "@/config/thresholds";
import { clamp01 } from "./confidence";

export interface ScrollTarget {
  /** continuous pixel scroll for a real scrollable container (delta may be negative) */
  scrollBy?: (deltaPx: number) => void;
  /** discrete step for paginated content; called at most once per interval, faster the further the head is turned */
  step?: (dir: 1 | -1) => void;
}

export interface HeadScrollStatus {
  active: boolean;
  hasTarget: boolean;
  direction: -1 | 0 | 1;
  speed: number; // 0..1
}

/** How much slower page turns are right at the dead zone edge, compared to full deflection. */
const SLOW_PAGE_INTERVAL_FACTOR = 4;
/** EMA weight for the new sample when smoothing speed — irons out per-frame tracking noise into a fluid ramp. */
const SPEED_SMOOTHING_ALPHA = 0.3;

/**
 * Continuous head-pitch-driven scrolling, toggled on/off by the configured gesture (see ScrollToggleDetector).
 * While active: tilting the head down scrolls down, up scrolls up. How far past the dead zone the head
 * is tilted sets the speed (curved by `scrollCurve`, then smoothed — see SPEED_SMOOTHING_ALPHA) — a small
 * tilt crawls, a full tilt scrolls at `scrollMaxSpeed` (continuous targets) or turns a page every
 * `scrollPageIntervalMs` (paginated targets). Independent of focus/confirm gestures — it never touches the
 * interaction state machine.
 */
export class HeadScrollController {
  private active = false;
  private target: ScrollTarget | null = null;
  private lastT: number | null = null;
  private lastStepAt = 0;
  private direction: -1 | 0 | 1 = 0;
  private speed = 0;

  /** The GUI declares which scrollable/pageable surface is currently on screen (null = nothing to drive). */
  setTarget(target: ScrollTarget | null) {
    this.target = target;
  }

  isActive() {
    return this.active;
  }

  /** Turn scrolling on/off without dropping the registered target. */
  setActive(active: boolean) {
    this.active = active;
    this.direction = 0;
    this.speed = 0;
    this.lastT = null;
  }

  toggle(): boolean {
    this.setActive(!this.active);
    return this.active;
  }

  reset() {
    this.setActive(false);
    this.target = null;
  }

  update(s: Signals, t: number, th: Thresholds) {
    if (!this.active || !s.tracking) {
      this.direction = 0;
      this.speed = 0;
      this.lastT = t;
      return;
    }
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT) / 1000;
    this.lastT = t;

    const pitch = s.headPitch; // + = up
    const mag = Math.abs(pitch);
    if (mag <= th.scrollDeadzone) {
      this.direction = 0;
      this.speed = 0;
      return;
    }
    const ramp = clamp01((mag - th.scrollDeadzone) / (1 - th.scrollDeadzone));
    const rawSpeed = Math.pow(ramp, th.scrollCurve);
    // smoothed, not raw: head pitch still carries a little per-frame tracking noise even after the signal
    // smoother, and applying that noise straight to scroll speed reads as glitchy/stuttery motion
    this.speed = this.speed * (1 - SPEED_SMOOTHING_ALPHA) + rawSpeed * SPEED_SMOOTHING_ALPHA;
    this.direction = pitch < 0 ? 1 : -1; // pitch negative = head tilted down = scroll down

    if (!this.target) return;

    if (this.target.scrollBy && dt > 0) {
      this.target.scrollBy(this.direction * this.speed * th.scrollMaxSpeed * dt);
    }
    if (this.target.step) {
      const slow = th.scrollPageIntervalMs * SLOW_PAGE_INTERVAL_FACTOR;
      const interval = slow - (slow - th.scrollPageIntervalMs) * this.speed;
      if (t - this.lastStepAt >= interval) {
        this.lastStepAt = t;
        this.target.step(this.direction);
      }
    }
  }

  getStatus(): HeadScrollStatus {
    return { active: this.active, hasTarget: !!this.target, direction: this.direction, speed: this.speed };
  }
}
