import type { QualityLevel, TrackingQuality } from "@/types/signals";
import type { TrackingFrame } from "@/types/tracking";

const NONE: TrackingQuality = {
  faceDetected: false,
  faceSize: "NONE",
  inFrame: "NONE",
  motion: "NONE",
  latency: "NONE",
  landmarks: "NONE",
  headPose: "NONE",
  overall: 0,
  issues: ["Face not detected"],
};

const score = (l: QualityLevel) => (l === "GOOD" ? 1 : l === "FAIR" ? 0.6 : l === "POOR" ? 0.25 : 0);

/** Stateful heuristic quality estimator (needs previous frame for motion). */
export class TrackingQualityEstimator {
  private prevCenter: { x: number; y: number; t: number } | null = null;
  private motionEma = 0;

  reset() {
    this.prevCenter = null;
    this.motionEma = 0;
  }

  update(frame: TrackingFrame): TrackingQuality {
    if (!frame.faceDetected || !frame.bbox) {
      this.prevCenter = null;
      return { ...NONE, issues: [...NONE.issues] };
    }
    const issues: string[] = [];
    const { bbox } = frame;

    // face size relative to frame width
    let faceSize: QualityLevel = "GOOD";
    if (bbox.w < 0.12) { faceSize = "POOR"; issues.push("Face too small — move closer"); }
    else if (bbox.w < 0.2) { faceSize = "FAIR"; issues.push("Face small"); }
    else if (bbox.w > 0.8) { faceSize = "FAIR"; issues.push("Face very close"); }

    // margin to frame edges
    const margin = Math.min(bbox.x, bbox.y, 1 - (bbox.x + bbox.w), 1 - (bbox.y + bbox.h));
    let inFrame: QualityLevel = "GOOD";
    if (margin < 0) { inFrame = "POOR"; issues.push("Face partially outside frame"); }
    else if (margin < 0.04) { inFrame = "FAIR"; issues.push("Face near frame edge"); }

    // motion: bbox centre velocity (fraction of frame per second)
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    let motion: QualityLevel = "GOOD";
    if (this.prevCenter) {
      const dt = Math.max(1, frame.timestamp - this.prevCenter.t) / 1000;
      const v = Math.hypot(cx - this.prevCenter.x, cy - this.prevCenter.y) / dt;
      this.motionEma = this.motionEma * 0.8 + v * 0.2;
      if (this.motionEma > 1.2) { motion = "POOR"; issues.push("Excessive movement"); }
      else if (this.motionEma > 0.5) { motion = "FAIR"; }
    }
    this.prevCenter = { x: cx, y: cy, t: frame.timestamp };

    let latency: QualityLevel = "GOOD";
    if (frame.inferenceMs > 60) { latency = "POOR"; issues.push(`Slow inference (${frame.inferenceMs.toFixed(0)} ms)`); }
    else if (frame.inferenceMs > 33) latency = "FAIR";

    let landmarks: QualityLevel = "GOOD";
    if (frame.landmarks.length < 400) { landmarks = "POOR"; issues.push("Incomplete landmarks"); }
    else if (Object.keys(frame.blendshapes).length === 0) { landmarks = "FAIR"; issues.push("No blendshapes"); }

    const headPose: QualityLevel = frame.headMatrix ? "GOOD" : "FAIR";
    if (!frame.headMatrix) issues.push("Head pose from landmarks only");

    const overall =
      0.25 * score(faceSize) + 0.2 * score(inFrame) + 0.15 * score(motion) + 0.1 * score(latency) + 0.2 * score(landmarks) + 0.1 * score(headPose);

    return { faceDetected: true, faceSize, inFrame, motion, latency, landmarks, headPose, overall, issues };
  }
}
