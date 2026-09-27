import type { DetectorStatus } from "./Detector";
import type { NewInputEvent } from "@/events/types";
import type { Thresholds } from "@/config/thresholds";
import { clamp01 } from "./confidence";

export interface GazeStatus extends DetectorStatus {
  targetId: string | null;
  dwellMs: number;
  stability: number;
  held: boolean;
}

/**
 * Dwell detector over the current focus target. Emits GAZE_ENTER / GAZE_EXIT on target changes and
 * GAZE_HOLD once the same target has been under the pointer for gazeHoldMs with stability ≥ focusStability.
 * "Gaze" here means the pointer source (head pointer by default) — see pointer.ts.
 */
export class GazeDetector {
  readonly name = "gaze";
  private current: string | null = null;
  private enteredAt = 0;
  private held = false;
  private history: Array<{ t: number; id: string | null }> = [];
  private stability = 0;
  private last?: DetectorStatus["last"];

  reset() {
    this.current = null;
    this.held = false;
    this.history = [];
    this.stability = 0;
  }

  get targetId() {
    return this.current;
  }

  update(targetId: string | null, t: number, th: Thresholds, quality: number, tracking: boolean, pointerSource: string): NewInputEvent[] {
    const out: NewInputEvent[] = [];
    if (!tracking) {
      if (this.current) out.push({ type: "GAZE_EXIT", timestamp: t, confidence: 1, duration: t - this.enteredAt, source: "head", metadata: { target: this.current, reason: "tracking lost" } });
      this.reset();
      return out;
    }
    this.history.push({ t, id: targetId });
    while (this.history.length && this.history[0].t < t - th.focusWindowMs) this.history.shift();

    if (targetId !== this.current) {
      if (this.current) {
        out.push({ type: "GAZE_EXIT", timestamp: t, confidence: 1, duration: t - this.enteredAt, source: "head", metadata: { target: this.current, dwellMs: t - this.enteredAt } });
      }
      this.current = targetId;
      this.enteredAt = t;
      this.held = false;
      if (targetId) {
        out.push({ type: "GAZE_ENTER", timestamp: t, confidence: clamp01(quality), source: "head", metadata: { target: targetId, pointerSource } });
      }
    }

    if (this.current) {
      const onTarget = this.history.filter((h) => h.id === this.current).length;
      this.stability = this.history.length ? onTarget / this.history.length : 0;
      const dwell = t - this.enteredAt;
      if (!this.held && dwell >= th.gazeHoldMs && this.stability >= th.focusStability) {
        this.held = true;
        const confidence = clamp01(0.5 * this.stability + 0.3 * clamp01(dwell / (th.gazeHoldMs * 2)) + 0.2 * quality);
        out.push({ type: "GAZE_HOLD", timestamp: t, confidence, duration: dwell, source: "head", metadata: { target: this.current, stability: this.stability, gazeHoldMs: th.gazeHoldMs, focusStability: th.focusStability, pointerSource } });
        this.last = { type: "GAZE_HOLD", confidence, at: t };
      }
    } else {
      this.stability = 0;
    }
    return out;
  }

  getStatus(t: number, th: Thresholds): GazeStatus {
    const dwell = this.current ? t - this.enteredAt : 0;
    return {
      name: this.name,
      active: !!this.current,
      progress: this.current ? clamp01(dwell / th.gazeHoldMs) : 0,
      durationMs: dwell,
      phase: !this.current ? "no target" : this.held ? "held" : this.stability < th.focusStability ? "unstable" : "dwelling",
      thresholds: { gazeHoldMs: th.gazeHoldMs, focusStability: th.focusStability },
      last: this.last,
      targetId: this.current,
      dwellMs: dwell,
      stability: this.stability,
      held: this.held,
    };
  }
}
