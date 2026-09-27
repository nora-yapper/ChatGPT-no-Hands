import { describe, expect, it } from "vitest";
import { SignalSmoother } from "@/signals/smoothSignals";
import { DEFAULT_SMOOTHING, DEFAULT_THRESHOLDS } from "@/config/thresholds";
import { normalizeSignals } from "@/signals/normalizeSignals";
import { CalibrationSession, DEFAULT_BASELINE } from "@/signals/calibration";
import { computePointer } from "@/signals/pointer";
import { headPoseFromMatrix } from "@/tracking/headPose";
import { FocusManager } from "@/interaction/focusManager";
import type { TrackingFrame } from "@/types/tracking";
import { sig } from "./helpers";

function frame(t: number, opts: { yawDeg?: number; blink?: number; jaw?: number } = {}): TrackingFrame {
  const yaw = ((opts.yawDeg ?? 0) * Math.PI) / 180;
  // column-major rotation about Y with our sign convention (yaw = -atan2(R02, R22)) and a translation of -50 cm in z
  const c = Math.cos(-yaw), s = Math.sin(-yaw);
  const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1];
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  return {
    timestamp: t, faceDetected: true, landmarks, headMatrix: m, bbox: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 }, imageWidth: 640, imageHeight: 480, inferenceMs: 10,
    blendshapes: { eyeBlinkLeft: opts.blink ?? 0.1, eyeBlinkRight: opts.blink ?? 0.1, jawOpen: opts.jaw ?? 0.05 },
  };
}

describe("headPoseFromMatrix", () => {
  it("recovers yaw with the documented sign convention", () => {
    const p = headPoseFromMatrix(frame(0, { yawDeg: 15 }).headMatrix!);
    expect(p?.fromMatrix).toBe(true);
    expect(p?.yaw).toBeCloseTo(15, 3);
    expect(p?.pitch).toBeCloseTo(0, 3);
  });
});

describe("calibration + normalization", () => {
  it("zeroes head yaw and maps eye openness to 1 at the calibrated neutral pose", () => {
    const session = new CalibrationSession(0, 1000);
    for (let t = 0; t <= 1000; t += 50) session.addFrame(frame(t, { yawDeg: 8, blink: 0.25, jaw: 0.1 }));
    const base = session.finish(1000)!;
    expect(base.headYawDeg).toBeCloseTo(8, 3);
    const s = normalizeSignals(frame(2000, { yawDeg: 8, blink: 0.25, jaw: 0.1 }), base, DEFAULT_THRESHOLDS);
    expect(s.headYaw).toBeCloseTo(0, 3);
    expect(s.leftEyeOpenness).toBeCloseTo(1, 3);
    expect(s.mouthOpenness).toBeCloseTo(0, 3);
    const turned = normalizeSignals(frame(2100, { yawDeg: 18, blink: 0.25 }), base, DEFAULT_THRESHOLDS);
    expect(turned.headYaw).toBeCloseTo(10 / DEFAULT_THRESHOLDS.headYawRangeDeg, 3);
  });

  it("uses the default baseline when uncalibrated", () => {
    const s = normalizeSignals(frame(0, { yawDeg: -10 }), DEFAULT_BASELINE, DEFAULT_THRESHOLDS);
    expect(s.headYaw).toBeCloseTo(-0.5, 3);
  });
});

describe("SignalSmoother", () => {
  it("applies EMA and dead zone, and keeps raw untouched", () => {
    const sm = new SignalSmoother();
    const a = sm.update(sig(0, { headYaw: 0 }), DEFAULT_SMOOTHING);
    const raw = sig(16, { headYaw: 1 });
    const b = sm.update(raw, DEFAULT_SMOOTHING);
    expect(a.headYaw).toBe(0);
    expect(b.headYaw).toBeGreaterThan(0);
    expect(b.headYaw).toBeLessThan(1);
    expect(raw.headYaw).toBe(1);
    const c = sm.update(sig(32, { headYaw: 0.02 }), { ...DEFAULT_SMOOTHING, head: 1, deadZone: 0.05 });
    expect(c.headYaw).toBe(0);
  });
});

describe("pointer + focus hit-testing", () => {
  it("maps head yaw/pitch to the test area and hits the right target", () => {
    const fm = new FocusManager();
    fm.setAreaRect({ left: 100, top: 100, width: 1000, height: 500 });
    fm.register({ id: "left", kind: "button", label: "L", action: "X" }, () => ({ left: 100, top: 300, width: 200, height: 100 }));
    fm.register({ id: "right", kind: "button", label: "R", action: "X" }, () => ({ left: 900, top: 300, width: 200, height: 100 }));
    const th = { ...DEFAULT_THRESHOLDS, pointerGainX: 1, pointerGainY: 1 };
    const centre = computePointer(sig(0), th);
    expect(centre.pointerX).toBeCloseTo(0.5);
    expect(fm.hitTest(centre.pointerX, centre.pointerY)).toBeNull();
    const right = computePointer(sig(0, { headYaw: 0.9 }), th);
    expect(fm.hitTest(right.pointerX, right.pointerY)).toBe("right");
    const left = computePointer(sig(0, { headYaw: -0.9 }), th);
    expect(fm.hitTest(left.pointerX, left.pointerY)).toBe("left");
    fm.setCurrent("left");
    expect(fm.step("RIGHT")).toBe("right");
    expect(fm.step("UP")).toBe("left");
  });
});
