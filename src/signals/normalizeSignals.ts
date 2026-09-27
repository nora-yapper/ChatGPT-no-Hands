import type { CalibrationBaseline, Signals } from "@/types/signals";
import type { TrackingFrame } from "@/types/tracking";
import type { Thresholds } from "@/config/thresholds";
import { BLENDSHAPE as B } from "@/config/blendshapeMap";
import { headPoseFromLandmarks, headPoseFromMatrix } from "@/tracking/headPose";
import { LM } from "@/tracking/landmarkIndices";
import { neutralSignals } from "./calibration";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const bs = (frame: TrackingFrame, name: string) => frame.blendshapes[name] ?? 0;

export interface RawHead {
  headX: number; // 0..1, flipped so 1 = subject's right
  headY: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  fromMatrix: boolean;
}

export function rawHead(frame: TrackingFrame): RawHead | null {
  if (!frame.faceDetected || frame.landmarks.length === 0) return null;
  const pose =
    frame.stablePose ??
    (frame.headMatrix ? headPoseFromMatrix(frame.headMatrix) : null) ?? headPoseFromLandmarks(frame.landmarks);
  if (!pose) return null;
  const nose = frame.landmarks[LM.noseTip] ?? frame.landmarks[0];
  return {
    headX: 1 - nose.x,
    headY: nose.y,
    yawDeg: pose.yaw,
    pitchDeg: pose.pitch,
    rollDeg: pose.roll,
    fromMatrix: pose.fromMatrix,
  };
}

export interface RawFacial {
  leftEyeOpen: number;
  rightEyeOpen: number;
  leftBlink: number;
  rightBlink: number;
  leftSquint: number;
  rightSquint: number;
  jawOpen: number;
  leftBrow: number;
  rightBrow: number;
  browFurrow: number;
  smile: number;
  eyeX: number;
  eyeY: number;
}

export function rawFacial(frame: TrackingFrame): RawFacial {
  const lb = bs(frame, B.eyeBlinkLeft);
  const rb = bs(frame, B.eyeBlinkRight);
  // Eye direction relative to head. "Out" for the left eye = subject's left; "In" = toward the nose.
  const eyeX =
    (bs(frame, B.eyeLookInLeft) - bs(frame, B.eyeLookOutLeft) + bs(frame, B.eyeLookOutRight) - bs(frame, B.eyeLookInRight)) / 2;
  const eyeY =
    (bs(frame, B.eyeLookUpLeft) - bs(frame, B.eyeLookDownLeft) + bs(frame, B.eyeLookUpRight) - bs(frame, B.eyeLookDownRight)) / 2;
  return {
    leftEyeOpen: 1 - lb,
    rightEyeOpen: 1 - rb,
    leftBlink: lb,
    rightBlink: rb,
    leftSquint: bs(frame, B.eyeSquintLeft),
    rightSquint: bs(frame, B.eyeSquintRight),
    jawOpen: bs(frame, B.jawOpen),
    leftBrow: (bs(frame, B.browOuterUpLeft) + bs(frame, B.browInnerUp)) / 2,
    rightBrow: (bs(frame, B.browOuterUpRight) + bs(frame, B.browInnerUp)) / 2,
    browFurrow: (bs(frame, B.browDownLeft) + bs(frame, B.browDownRight)) / 2,
    smile: (bs(frame, B.mouthSmileLeft) + bs(frame, B.mouthSmileRight)) / 2,
    eyeX: clamp(eyeX, -1, 1),
    eyeY: clamp(eyeY, -1, 1),
  };
}

/** value above baseline rescaled so that baseline→0 and 1→1 */
function aboveBaseline(v: number, base: number): number {
  const range = Math.max(0.05, 1 - base);
  return clamp((v - base) / range, 0, 1);
}

/**
 * Convert a tracking frame into normalized raw signals (no smoothing).
 * The pointer is not computed here; see pointer.ts (it runs on smoothed values).
 */
export function normalizeSignals(frame: TrackingFrame, base: CalibrationBaseline, th: Thresholds): Signals {
  const s = neutralSignals(frame.timestamp);
  const head = rawHead(frame);
  if (!head) {
    return s;
  }
  const f = rawFacial(frame);
  s.tracking = true;

  s.headX = clamp(0.5 + (head.headX - base.headX), 0, 1);
  s.headY = clamp(0.5 + (head.headY - base.headY), 0, 1);
  s.headYawDeg = head.yawDeg;
  s.headPitchDeg = head.pitchDeg;
  s.headRollDeg = head.rollDeg;
  s.headPoseFromMatrix = head.fromMatrix;

  const yawSign = th.invertYaw ? -1 : 1;
  const pitchSign = th.invertPitch ? -1 : 1;
  s.headYaw = clamp((yawSign * (head.yawDeg - base.headYawDeg)) / th.headYawRangeDeg, -1, 1);
  s.headPitch = clamp((pitchSign * (head.pitchDeg - base.headPitchDeg)) / th.headPitchRangeDeg, -1, 1);
  s.headRoll = clamp((head.rollDeg - base.headRollDeg) / th.headRollRangeDeg, -1, 1);

  s.eyeX = f.eyeX;
  s.eyeY = f.eyeY;

  s.leftEyeOpenness = clamp(f.leftEyeOpen / base.leftEyeOpen, 0, 1);
  s.rightEyeOpenness = clamp(f.rightEyeOpen / base.rightEyeOpen, 0, 1);
  s.leftBlink = f.leftBlink;
  s.rightBlink = f.rightBlink;
  s.leftSquint = f.leftSquint;
  s.rightSquint = f.rightSquint;
  s.jawOpen = f.jawOpen;
  s.mouthOpenness = aboveBaseline(f.jawOpen, base.jawOpen);
  s.leftBrowRaise = aboveBaseline(f.leftBrow, base.leftBrow);
  s.rightBrowRaise = aboveBaseline(f.rightBrow, base.rightBrow);
  s.browFurrow = aboveBaseline(f.browFurrow, base.browFurrow);
  s.smile = aboveBaseline(f.smile, base.smile);
  return s;
}
