import type { CalibrationBaseline } from "@/types/signals";
import type { Landmark, TrackingFrame } from "@/types/tracking";
import { headPoseFromLandmarks, headPoseFromMatrix, type HeadPoseDeg } from "@/tracking/headPose";
import { LM } from "@/tracking/landmarkIndices";
import { rawFacial } from "./normalizeSignals";

/**
 * Head pose that ignores facial expressions.
 *
 * MediaPipe's facial transformation matrix is a Procrustes fit over the whole mesh, including jaw, cheek and
 * brow points, so opening the mouth or raising the brows tilts it by a few degrees — which moves the head
 * pointer. Here the pose comes from the matrix only while the face is at rest. Once an expression starts
 * (jaw / brows / smile above the calibrated baseline), the pose is frozen at that last neutral value and
 * only *changes* in a frame built from rigid landmarks (eye corners + nose bridge/tip, none of which move with
 * the mouth or brows) are added on top. So real head motion still passes through during a gesture, and
 * expression-driven drift doesn't. When the face relaxes, the pose eases back onto the matrix over RELEASE_MS
 * instead of snapping.
 */

/** above-baseline blendshape levels that count as "an expression is deforming the mesh" */
const GATE = { jaw: 0.08, brow: 0.1, smile: 0.2 };
/** time constant for easing back onto the matrix pose after an expression ends */
const RELEASE_MS = 150;

type Vec3 = [number, number, number];
/** rotation matrix as its three column vectors (face x / y / z axes in camera space) */
type Frame3 = [Vec3, Vec3, Vec3];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-9, Math.hypot(a[0], a[1], a[2])));
const RAD2DEG = 180 / Math.PI;

/**
 * Orthonormal face frame from rigid points, in camera space (x right, y down, z away from camera; landmark z
 * shares x's scale, so both are multiplied by the image width). x = right eye → left eye, y = nose bridge →
 * nose tip made orthogonal to x. The frame's absolute orientation has an anatomy-dependent offset (the nose
 * isn't vertical), which is fine: only rotations *relative to an earlier frame* are ever used.
 */
export function rigidFaceFrame(lm: Landmark[], w: number, h: number): Frame3 | null {
  if (lm.length < 400) return null;
  const p = (...ids: number[]): Vec3 => {
    let x = 0, y = 0, z = 0;
    for (const i of ids) {
      x += lm[i].x * w;
      y += lm[i].y * h;
      z += lm[i].z * w;
    }
    return [x / ids.length, y / ids.length, z / ids.length];
  };
  const rightEye = p(LM.rightEyeOuter, LM.rightEyeInner);
  const leftEye = p(LM.leftEyeOuter, LM.leftEyeInner);
  const x = norm(sub(leftEye, rightEye));
  const down = sub(p(LM.noseTip, LM.noseLower), p(LM.noseBridge));
  const y = norm(sub(down, scale(x, dot(down, x))));
  return [x, y, cross(x, y)];
}

/** yaw/pitch/roll (deg, headPose.ts conventions) of the rotation that takes face frame `from` to `to` */
export function relativeRotationDeg(from: Frame3, to: Frame3): { yaw: number; pitch: number; roll: number } {
  // R_rel = R_to · R_fromᵀ; applied to v: Σ_k to[k] · (from[k] · v)
  const apply = (v: Vec3): Vec3 => {
    const out: Vec3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const c = dot(from[k], v);
      out[0] += to[k][0] * c;
      out[1] += to[k][1] * c;
      out[2] += to[k][2] * c;
    }
    return out;
  };
  // a camera-facing face looks down -z; its eye line runs along +x (subject's right → left, unmirrored)
  const f = apply([0, 0, -1]);
  const e = apply([1, 0, 0]);
  return {
    yaw: Math.atan2(-f[0], -f[2]) * RAD2DEG, // nose toward image-left = subject turns right = +
    pitch: Math.atan2(-f[1], Math.hypot(f[0], f[2])) * RAD2DEG, // nose up (−y) = +
    roll: -Math.atan2(e[1], e[0]) * RAD2DEG, // subject's left eye (image right) rising = tilt toward right shoulder = +
  };
}

export class StableHeadPose {
  private anchor: { frame: Frame3; pose: HeadPoseDeg } | null = null;
  /** stable − reference pose, decayed toward 0 after an expression ends */
  private correction = { yaw: 0, pitch: 0, roll: 0 };
  private last: HeadPoseDeg | null = null;
  private lastT: number | null = null;
  expressive = false;

  reset() {
    this.anchor = null;
    this.correction = { yaw: 0, pitch: 0, roll: 0 };
    this.last = null;
    this.lastT = null;
    this.expressive = false;
  }

  update(frame: TrackingFrame, base: CalibrationBaseline): HeadPoseDeg | null {
    if (!frame.faceDetected || frame.landmarks.length === 0) return null;
    const ref = (frame.headMatrix ? headPoseFromMatrix(frame.headMatrix) : null) ?? headPoseFromLandmarks(frame.landmarks);
    const rigid = rigidFaceFrame(frame.landmarks, frame.imageWidth, frame.imageHeight);
    if (!ref || !rigid) return ref;
    const dt = this.lastT === null ? 0 : Math.max(0, frame.timestamp - this.lastT);
    this.lastT = frame.timestamp;

    const f = rawFacial(frame);
    const wasExpressive = this.expressive;
    this.expressive =
      f.jawOpen - base.jawOpen > GATE.jaw ||
      Math.max(f.leftBrow - base.leftBrow, f.rightBrow - base.rightBrow) > GATE.brow ||
      f.smile - base.smile > GATE.smile;

    if (this.expressive && this.anchor) {
      const d = relativeRotationDeg(this.anchor.frame, rigid);
      const a = this.anchor.pose;
      this.last = { yaw: a.yaw + d.yaw, pitch: a.pitch + d.pitch, roll: a.roll + d.roll, fromMatrix: ref.fromMatrix };
      return this.last;
    }

    // just relaxed: start easing from where the pointer actually was, not from the (still slightly deformed) matrix
    if (wasExpressive && this.last) {
      this.correction = { yaw: this.last.yaw - ref.yaw, pitch: this.last.pitch - ref.pitch, roll: this.last.roll - ref.roll };
    }
    const k = Math.exp(-dt / RELEASE_MS);
    this.correction = { yaw: this.correction.yaw * k, pitch: this.correction.pitch * k, roll: this.correction.roll * k };
    const pose = { yaw: ref.yaw + this.correction.yaw, pitch: ref.pitch + this.correction.pitch, roll: ref.roll + this.correction.roll, fromMatrix: ref.fromMatrix };
    this.anchor = { frame: rigid, pose };
    this.last = pose;
    return pose;
  }
}
