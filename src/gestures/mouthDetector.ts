import type { Detector, DetectorContext, DetectorStatus } from "./Detector";
import type { NewInputEvent } from "@/events/types";
import type { Signals } from "@/types/signals";
import { combine, strengthScore, clamp01 } from "./confidence";

/**
 * MOUTH_OPEN when openness crosses the threshold; MOUTH_HOLD when it stays open for mouthHoldMs
 * with low variance (speaking makes openness oscillate, which the speech guard rejects).
 */
export class MouthDetector implements Detector {
  readonly name = "mouth";
  private openSince: number | null = null;
  private holdEmitted = false;
  private window: Array<{ t: number; v: number }> = [];
  private last?: DetectorStatus["last"];
  private status: DetectorStatus = { name: this.name, active: false, progress: 0, durationMs: 0, phase: "closed", thresholds: {} };

  reset() {
    this.openSince = null;
    this.holdEmitted = false;
    this.window = [];
  }

  update(s: Signals, ctx: DetectorContext): NewInputEvent[] {
    const th = ctx.thresholds;
    const out: NewInputEvent[] = [];
    const t = s.timestamp;
    if (!s.tracking) {
      this.reset();
      this.set(false, 0, 0, "no tracking", th, 0);
      return out;
    }
    const open = s.mouthOpenness >= th.mouthOpenThreshold;
    this.window.push({ t, v: s.mouthOpenness });
    while (this.window.length && this.window[0].t < t - th.mouthHoldMs) this.window.shift();
    const std = stddev(this.window.map((w) => w.v));

    if (!open) {
      if (this.openSince !== null) this.openSince = null;
      this.holdEmitted = false;
      this.set(false, clamp01(s.mouthOpenness / th.mouthOpenThreshold), 0, "closed", th, std);
      return out;
    }

    if (this.openSince === null) {
      this.openSince = t;
      this.holdEmitted = false;
      const confidence = combine([[1, strengthScore(s.mouthOpenness, th.mouthOpenThreshold)]], ctx.quality.overall);
      out.push({ type: "MOUTH_OPEN", timestamp: t, confidence, source: "face", metadata: { openness: s.mouthOpenness, threshold: th.mouthOpenThreshold } });
    }
    const dur = t - this.openSince;
    const speaking = std > th.mouthSpeechStd;
    if (!this.holdEmitted && dur >= th.mouthHoldMs) {
      if (speaking) {
        this.set(true, 1, dur, "speaking? (variance too high)", th, std);
        return out;
      }
      this.holdEmitted = true;
      const confidence = combine(
        [
          [0.5, strengthScore(s.mouthOpenness, th.mouthOpenThreshold)],
          [0.5, 1 - std / th.mouthSpeechStd],
        ],
        ctx.quality.overall,
      );
      out.push({ type: "MOUTH_HOLD", timestamp: t, confidence, duration: dur, source: "face", metadata: { openness: s.mouthOpenness, std, threshold: th.mouthOpenThreshold, holdMs: th.mouthHoldMs } });
      this.last = { type: "MOUTH_HOLD", confidence, at: t };
    }
    this.set(true, clamp01(dur / th.mouthHoldMs), dur, this.holdEmitted ? "held" : speaking ? "open (speaking?)" : "holding", th, std);
    return out;
  }

  private set(active: boolean, progress: number, durationMs: number, phase: string, th: DetectorContext["thresholds"], std: number) {
    this.status = {
      name: this.name, active, progress, durationMs, phase,
      thresholds: { mouthOpenThreshold: th.mouthOpenThreshold, mouthHoldMs: th.mouthHoldMs, speechStd: th.mouthSpeechStd, currentStd: Math.round(std * 1000) / 1000 },
      last: this.last,
    };
  }

  getStatus() {
    return this.status;
  }
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return Math.sqrt(v);
}
