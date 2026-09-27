export type PointerSource = "head" | "head+eye";

/** Normalized signals. Head axes are -1..1 (0 = calibrated neutral), openness-type signals are 0..1. */
export interface Signals {
  timestamp: number;
  tracking: boolean;

  // Head position in the camera image, 0..1 (x is flipped so that 1 = user's right / screen right)
  headX: number;
  headY: number;
  // Head rotation, -1..1 after calibration. yaw + = user's right, pitch + = up, roll + = tilt toward user's right shoulder
  headYaw: number;
  headPitch: number;
  headRoll: number;
  // Raw rotation in degrees (uncalibrated) for the debug panel
  headYawDeg: number;
  headPitchDeg: number;
  headRollDeg: number;
  /** true when rotation came from the provider's head matrix rather than landmark geometry */
  headPoseFromMatrix: boolean;

  // Eye direction relative to the head, -1..1 (from eyeLook* blendshapes). Not screen gaze.
  eyeX: number;
  eyeY: number;

  // Screen-space pointer (0..1 relative to the interaction test area)
  pointerX: number;
  pointerY: number;
  pointerSource: PointerSource;

  // Facial signals 0..1
  leftEyeOpenness: number;
  rightEyeOpenness: number;
  leftBlink: number;
  rightBlink: number;
  leftSquint: number;
  rightSquint: number;
  mouthOpenness: number;
  jawOpen: number;
  leftBrowRaise: number;
  rightBrowRaise: number;
  browFurrow: number;
  smile: number;
}

export type QualityLevel = "GOOD" | "FAIR" | "POOR" | "NONE";

export interface TrackingQuality {
  faceDetected: boolean;
  faceSize: QualityLevel;
  inFrame: QualityLevel;
  motion: QualityLevel;
  latency: QualityLevel;
  landmarks: QualityLevel;
  headPose: QualityLevel;
  /** 0..1 heuristic */
  overall: number;
  issues: string[];
}

export interface SignalBundle {
  raw: Signals;
  smoothed: Signals;
  quality: TrackingQuality;
}

/** Neutral baseline captured during calibration. Values are in raw provider units. */
export interface CalibrationBaseline {
  capturedAt: number;
  sampleCount: number;
  headX: number;
  headY: number;
  headYawDeg: number;
  headPitchDeg: number;
  headRollDeg: number;
  leftEyeOpen: number; // raw (1 - eyeBlink)
  rightEyeOpen: number;
  jawOpen: number;
  leftBrow: number;
  rightBrow: number;
  browFurrow: number;
  smile: number;
}
