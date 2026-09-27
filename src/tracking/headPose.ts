import type { Landmark } from "@/types/tracking";
import { LM } from "./landmarkIndices";

export interface HeadPoseDeg {
  yaw: number; // + = subject turns toward their right
  pitch: number; // + = up
  roll: number; // + = tilt toward subject's right shoulder
  fromMatrix: boolean;
}

const RAD2DEG = 180 / Math.PI;

/**
 * Extract Euler angles from a 4x4 facial transformation matrix.
 * MediaPipe reports the matrix as a flat 16-array; the proto default is column-major
 * (element (r,c) at data[c*4 + r]). We sanity-check with the translation component
 * (the head sits tens of cm in front of the camera, so |tz| is large) and fall back to
 * row-major if that is where the translation actually lives.
 *
 * Conventions (derived from the canonical face model: +x = subject's left, +y = up, +z = toward camera):
 *   turning right rotates the face's +z axis toward -x  → yaw = -atan2(R02, R22)
 *   looking up rotates +z toward +y                      → pitch = atan2(R12, hypot(R02, R22))
 */
export function headPoseFromMatrix(data: number[]): HeadPoseDeg | null {
  if (!data || data.length !== 16) return null;
  const colMajor = Math.abs(data[14]) >= Math.abs(data[11]);
  const m = (r: number, c: number) => (colMajor ? data[c * 4 + r] : data[r * 4 + c]);
  const r02 = m(0, 2);
  const r12 = m(1, 2);
  const r22 = m(2, 2);
  const r01 = m(0, 1);
  const r11 = m(1, 1);
  const yaw = -Math.atan2(r02, r22) * RAD2DEG;
  const pitch = Math.atan2(r12, Math.hypot(r02, r22)) * RAD2DEG;
  const roll = -Math.atan2(r01, r11) * RAD2DEG;
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || !Number.isFinite(roll)) return null;
  return { yaw, pitch, roll, fromMatrix: true };
}

/**
 * Fallback: coarse pose from landmark geometry. Image is unmirrored, so the subject's
 * right appears at smaller x. Angles are approximate (pseudo-degrees scaled to be in the
 * same ballpark as the matrix output).
 */
export function headPoseFromLandmarks(lm: Landmark[]): HeadPoseDeg | null {
  if (lm.length < 400) return null;
  const nose = lm[LM.noseTip];
  const l = lm[LM.leftCheek];
  const r = lm[LM.rightCheek];
  const top = lm[LM.forehead];
  const chin = lm[LM.chin];
  const cx = (l.x + r.x) / 2;
  const cy = (top.y + chin.y) / 2;
  const halfW = Math.max(1e-4, Math.abs(l.x - r.x) / 2);
  const halfH = Math.max(1e-4, Math.abs(chin.y - top.y) / 2);
  // nose moving toward subject's right = image-left = negative dx  → positive yaw
  const yaw = (-(nose.x - cx) / halfW) * 45;
  const pitch = (-(nose.y - cy) / halfH) * 45;
  // eye line tilt; subject's left eye (image right) lower than right eye → tilt toward subject's left
  const le = lm[LM.leftEyeOuter];
  const re = lm[LM.rightEyeOuter];
  const roll = -Math.atan2(le.y - re.y, le.x - re.x) * RAD2DEG;
  return { yaw, pitch, roll, fromMatrix: false };
}
