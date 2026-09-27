import type { Signals } from "@/types/signals";
import type { Thresholds } from "@/config/thresholds";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Map head direction (and optionally eye direction) to a 0..1 pointer over the test area.
 * This is a HEAD POINTER, not gaze. eyeBlendWeight > 0 is an experimental blend.
 */
export function computePointer(s: Signals, th: Thresholds): Signals {
  if (!s.tracking) return { ...s, pointerX: 0.5, pointerY: 0.5, pointerSource: th.eyeBlendWeight > 0 ? "head+eye" : "head" };
  const w = th.eyeBlendWeight;
  const x = s.headYaw * (1 - w) + s.eyeX * w;
  const y = s.headPitch * (1 - w) + s.eyeY * w;
  return {
    ...s,
    pointerX: clamp01(0.5 + x * th.pointerGainX * 0.5),
    pointerY: clamp01(0.5 - y * th.pointerGainY * 0.5),
    pointerSource: w > 0 ? "head+eye" : "head",
  };
}
