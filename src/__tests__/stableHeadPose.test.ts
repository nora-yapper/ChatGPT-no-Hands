import { describe, expect, it } from "vitest";
import { StableHeadPose, relativeRotationDeg, rigidFaceFrame } from "@/signals/stableHeadPose";
import { DEFAULT_BASELINE } from "@/signals/calibration";
import { LM } from "@/tracking/landmarkIndices";
import type { TrackingFrame } from "@/types/tracking";

const W = 640, H = 480;
const RAD = Math.PI / 180;
type V = [number, number, number];

// rigid points of a synthetic face in camera space (px; x right, y down, z away from camera)
const FACE: Record<number, V> = {
  [LM.rightEyeOuter]: [-45, 0, 0],
  [LM.rightEyeInner]: [-15, 0, -3],
  [LM.leftEyeInner]: [15, 0, -3],
  [LM.leftEyeOuter]: [45, 0, 0],
  [LM.noseBridge]: [0, 0, -8],
  [LM.noseLower]: [0, 40, -30],
  [LM.noseTip]: [0, 48, -34],
};

/** subject turns right (nose → image-left) by yaw, looks up by pitch */
function rotate([x, y, z]: V, yawDeg: number, pitchDeg: number): V {
  const a = yawDeg * RAD, b = pitchDeg * RAD;
  // yaw: forward (0,0,-1) → (-sin a, 0, -cos a)
  const x1 = Math.cos(a) * x + Math.sin(a) * z;
  const z1 = -Math.sin(a) * x + Math.cos(a) * z;
  // pitch: forward (0,0,-1) → (0, -sin b, -cos b)
  const y2 = Math.cos(b) * y + Math.sin(b) * z1;
  const z2 = -Math.sin(b) * y + Math.cos(b) * z1;
  return [x1, y2, z2];
}

/** column-major matrix whose headPoseFromMatrix() reads back (yaw, pitch) */
function matrix(yawDeg: number, pitchDeg: number): number[] {
  const cy = Math.cos(-yawDeg * RAD), sy = Math.sin(-yawDeg * RAD);
  const cp = Math.cos(pitchDeg * RAD), sp = Math.sin(pitchDeg * RAD);
  // R = Ry · Rx with r12 = sin(pitch), r02/r22 carrying yaw
  const r = [
    [cy, -sy * sp, sy * cp],
    [0, cp, sp],
    [-sy, -cy * sp, cy * cp],
  ];
  return [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, 0, 0, -50, 1];
}

function frame(t: number, o: { yaw?: number; pitch?: number; matrixYaw?: number; matrixPitch?: number; jaw?: number; brow?: number }): TrackingFrame {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [i, p] of Object.entries(FACE)) {
    const [x, y, z] = rotate(p, o.yaw ?? 0, o.pitch ?? 0);
    landmarks[Number(i)] = { x: (W / 2 + x) / W, y: (H / 2 + y) / H, z: z / W };
  }
  return {
    timestamp: t, faceDetected: true, landmarks, bbox: null, imageWidth: W, imageHeight: H, inferenceMs: 10,
    headMatrix: matrix(o.matrixYaw ?? o.yaw ?? 0, o.matrixPitch ?? o.pitch ?? 0),
    blendshapes: { jawOpen: o.jaw ?? 0, browInnerUp: o.brow ?? 0, browOuterUpLeft: o.brow ?? 0, browOuterUpRight: o.brow ?? 0 },
  };
}

const rigid = (o: Parameters<typeof frame>[1]) => rigidFaceFrame(frame(0, o).landmarks, W, H)!;

describe("rigid face frame", () => {
  it("measures relative rotation with the headPose.ts sign conventions", () => {
    const turned = relativeRotationDeg(rigid({}), rigid({ yaw: 12 }));
    expect(turned.yaw).toBeCloseTo(12, 3);
    expect(turned.pitch).toBeCloseTo(0, 3);
    expect(turned.roll).toBeCloseTo(0, 3);
    const lookingDown = relativeRotationDeg(rigid({}), rigid({ pitch: -7 }));
    expect(lookingDown.pitch).toBeCloseTo(-7, 3);
    expect(lookingDown.yaw).toBeCloseTo(0, 3);
  });
});

describe("StableHeadPose", () => {
  it("follows the matrix while the face is neutral", () => {
    const s = new StableHeadPose();
    const p = s.update(frame(0, { yaw: 5, pitch: 3 }), DEFAULT_BASELINE)!;
    expect(p.yaw).toBeCloseTo(5, 3);
    expect(p.pitch).toBeCloseTo(3, 3);
  });

  it("ignores the matrix tilt caused by opening the mouth", () => {
    const s = new StableHeadPose();
    s.update(frame(0, {}), DEFAULT_BASELINE);
    // head still, jaw open: the whole-mesh fit reports ~5° of pitch that isn't there
    const p = s.update(frame(33, { jaw: 0.6, matrixPitch: -5 }), DEFAULT_BASELINE)!;
    expect(s.expressive).toBe(true);
    expect(p.pitch).toBeCloseTo(0, 1);
  });

  it("ignores the matrix tilt caused by raising the brows", () => {
    const s = new StableHeadPose();
    s.update(frame(0, {}), DEFAULT_BASELINE);
    const p = s.update(frame(33, { brow: 0.6, matrixPitch: 4 }), DEFAULT_BASELINE)!;
    expect(p.pitch).toBeCloseTo(0, 1);
  });

  it("still passes real head motion through during a gesture", () => {
    const s = new StableHeadPose();
    s.update(frame(0, {}), DEFAULT_BASELINE);
    const p = s.update(frame(33, { jaw: 0.6, yaw: 10, matrixPitch: -5 }), DEFAULT_BASELINE)!;
    expect(p.yaw).toBeCloseTo(10, 1);
    expect(p.pitch).toBeCloseTo(0, 1);
  });

  it("eases back onto the matrix after the expression ends instead of snapping", () => {
    const s = new StableHeadPose();
    s.update(frame(0, {}), DEFAULT_BASELINE);
    s.update(frame(33, { jaw: 0.6, matrixPitch: -5 }), DEFAULT_BASELINE);
    // relaxed, but the matrix now disagrees with the rigid estimate by 2°: blend, don't jump
    const first = s.update(frame(66, { matrixPitch: 2 }), DEFAULT_BASELINE)!;
    expect(first.pitch).toBeGreaterThan(0);
    expect(first.pitch).toBeLessThan(2);
    let p = first;
    for (let t = 100; t <= 1000; t += 33) p = s.update(frame(t, { matrixPitch: 2 }), DEFAULT_BASELINE)!;
    expect(p.pitch).toBeCloseTo(2, 2);
  });
});
