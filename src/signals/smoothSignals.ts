import type { Signals } from "@/types/signals";
import type { Smoothing } from "@/config/thresholds";

const HEAD_KEYS = ["headX", "headY", "headYaw", "headPitch", "headRoll", "headYawDeg", "headPitchDeg", "headRollDeg"] as const;
const EYE_KEYS = ["eyeX", "eyeY"] as const;
const FACE_KEYS = [
  "leftEyeOpenness", "rightEyeOpenness", "leftBlink", "rightBlink", "leftSquint", "rightSquint",
  "mouthOpenness", "jawOpen", "leftBrowRaise", "rightBrowRaise", "browFurrow", "smile",
] as const;
const DEAD_ZONE_KEYS = ["headYaw", "headPitch", "headRoll"] as const;

function applyDeadZone(v: number, dz: number): number {
  if (dz <= 0) return v;
  const a = Math.abs(v);
  if (a < dz) return 0;
  // rescale so the output is continuous at the dead-zone edge
  return Math.sign(v) * ((a - dz) / (1 - dz));
}

/** Exponential moving average + dead zone. Keeps its own state; call reset() on tracking loss. */
export class SignalSmoother {
  private prev: Signals | null = null;

  reset() {
    this.prev = null;
  }

  update(raw: Signals, cfg: Smoothing): Signals {
    if (!raw.tracking) {
      this.prev = null;
      return { ...raw };
    }
    const out: Signals = { ...raw };
    const prev = this.prev;
    const ema = (key: keyof Signals, alpha: number) => {
      const cur = raw[key] as number;
      if (!prev) return cur;
      const p = prev[key] as number;
      return p + alpha * (cur - p);
    };
    for (const k of HEAD_KEYS) (out[k] as number) = ema(k, cfg.head);
    for (const k of EYE_KEYS) (out[k] as number) = ema(k, cfg.pointer);
    for (const k of FACE_KEYS) (out[k] as number) = ema(k, cfg.face);
    this.prev = { ...out };
    for (const k of DEAD_ZONE_KEYS) (out[k] as number) = applyDeadZone(out[k], cfg.deadZone);
    return out;
  }
}
