/** All live-tunable thresholds. Units are in the key names where relevant. */
export interface Thresholds {
  // focus / dwell
  gazeHoldMs: number;
  focusStability: number; // 0..1 fraction of samples on target within window
  focusWindowMs: number;
  armGraceMs: number; // keep ARMED this long after the pointer leaves the target (gesture may move head)
  cooldownMs: number;
  pointerMoveThreshold: number; // pointer velocity (fraction of area / s) considered "navigating"

  // blink
  eyeClosedThreshold: number; // openness below this = closed
  blinkMinMs: number;
  longBlinkMs: number;
  longBlinkMaxMs: number; // longer closures are treated as resting, not a gesture

  // head gestures
  nodThreshold: number;
  nodMaxDurationMs: number;
  shakeThreshold: number;
  shakeMaxDurationMs: number;
  gestureRefractoryMs: number;
  gestureCenterTolerance: number; // must start within this of neutral

  // mouth
  mouthOpenThreshold: number;
  mouthHoldMs: number;
  mouthSpeechStd: number; // std-dev of openness over the hold window above which we assume speaking

  // brows
  browRaiseThreshold: number;
  browMinMs: number;

  // look away / tracking
  lookAwayThreshold: number;
  lookAwayMs: number;
  trackingLostMs: number;

  // normalization ranges (degrees mapped to ±1)
  headYawRangeDeg: number;
  headPitchRangeDeg: number;
  headRollRangeDeg: number;
  invertYaw: boolean;
  invertPitch: boolean;

  // pointer
  pointerGainX: number;
  pointerGainY: number;
  eyeBlendWeight: number; // 0 = head only; >0 blends eye direction (experimental)

  // discrete navigation
  headStepThreshold: number;
  headStepRepeatMs: number;

  // grid glide navigation (layout comes from the GUI; movement is interpreted like a mouse)
  gridInput: GridInput;
  gridSensitivity: number; // area fractions travelled per normalized head unit (relative) / head→cursor gain (absolute)
  gridAcceleration: number; // extra gain per (head unit / s) of turn speed: fast flicks travel further than slow returns
  gridDeadZone: number; // head turn speed (units / s) below which the cursor does not move (jitter guard)
  gridHysteresis: number; // fraction of a cell the cursor must cross into a neighbour before the glide cell switches
  gridSettleMs: number; // cursor must be still this long on a cell before it becomes the focus
  gridSettleVelocity: number; // cursor velocity (fraction of area / s) below which the cursor counts as still

  // head scroll: a fast blink burst toggles continuous head-pitch-driven scrolling on/off
  scrollBlinkCount: number; // fast blinks in a row required to toggle
  scrollBlinkWindowMs: number; // all of them must land within this window
  scrollDeadzone: number; // head pitch magnitude (0..1) past neutral before scrolling starts
  scrollMaxSpeed: number; // px/s at full deflection, for continuously-scrollable content (e.g. chat)
  scrollCurve: number; // ramp exponent from the dead zone to full tilt: >1 = gentle start, steep finish
  scrollPageIntervalMs: number; // fastest time between page turns (paginated content, e.g. Recents) at full deflection
}

/** How head movement drives the grid cursor: relative = mouse-like deltas, absolute = head angle position. */
export type GridInput = "relative" | "absolute";

export const DEFAULT_THRESHOLDS: Thresholds = {
  gazeHoldMs: 500,
  focusStability: 0.85,
  focusWindowMs: 400,
  armGraceMs: 1000,
  cooldownMs: 500,
  pointerMoveThreshold: 0.35,

  eyeClosedThreshold: 0.3,
  blinkMinMs: 40,
  longBlinkMs: 600,
  longBlinkMaxMs: 2500,

  nodThreshold: 0.18,
  nodMaxDurationMs: 1200,
  shakeThreshold: 0.2,
  shakeMaxDurationMs: 1500,
  gestureRefractoryMs: 600,
  gestureCenterTolerance: 0.12,

  mouthOpenThreshold: 0.45,
  mouthHoldMs: 500,
  mouthSpeechStd: 0.08,

  browRaiseThreshold: 0.5,
  browMinMs: 300,

  lookAwayThreshold: 0.85,
  lookAwayMs: 400,
  trackingLostMs: 250,

  headYawRangeDeg: 20,
  headPitchRangeDeg: 15,
  headRollRangeDeg: 25,
  invertYaw: false,
  invertPitch: false,

  pointerGainX: 1.4,
  pointerGainY: 1.4,
  eyeBlendWeight: 0,

  headStepThreshold: 0.5,
  headStepRepeatMs: 600,

  gridInput: "relative",
  gridSensitivity: 0.9,
  gridAcceleration: 0.6,
  gridDeadZone: 0.25,
  gridHysteresis: 0.4, // stronger pull: a field holds the cursor through more overshoot before a neighbour takes over — steadies small targets like on-screen keys under face-tracking jitter
  gridSettleMs: 150,
  gridSettleVelocity: 0.3,

  scrollBlinkCount: 3,
  scrollBlinkWindowMs: 1200,
  scrollDeadzone: 0.12,
  scrollMaxSpeed: 900,
  scrollCurve: 1.6,
  scrollPageIntervalMs: 220,
};

export interface Smoothing {
  /** EMA factor 0..1 applied to head axes; 1 = no smoothing */
  head: number;
  /** EMA factor for eye direction / pointer */
  pointer: number;
  /** EMA factor for facial signals */
  face: number;
  /** dead zone on normalized head axes (0..0.3) */
  deadZone: number;
}

export const DEFAULT_SMOOTHING: Smoothing = {
  head: 0.35,
  pointer: 0.3,
  face: 0.5,
  deadZone: 0.04,
};

/** Metadata used to render sliders in the settings panel. */
export interface ThresholdMeta {
  key: keyof Thresholds;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  group: string;
}

export const THRESHOLD_META: ThresholdMeta[] = [
  { key: "gazeHoldMs", label: "Gaze hold", min: 200, max: 3000, step: 50, unit: "ms", group: "Focus" },
  { key: "focusStability", label: "Focus stability", min: 0.5, max: 1, step: 0.01, group: "Focus" },
  { key: "focusWindowMs", label: "Stability window", min: 100, max: 1500, step: 50, unit: "ms", group: "Focus" },
  { key: "armGraceMs", label: "Arm grace", min: 0, max: 3000, step: 50, unit: "ms", group: "Focus" },
  { key: "cooldownMs", label: "Cooldown", min: 0, max: 3000, step: 50, unit: "ms", group: "Focus" },
  { key: "pointerMoveThreshold", label: "Navigating velocity", min: 0.05, max: 2, step: 0.05, group: "Focus" },

  { key: "eyeClosedThreshold", label: "Eye closed below", min: 0.05, max: 0.8, step: 0.01, group: "Blink" },
  { key: "blinkMinMs", label: "Blink min", min: 0, max: 300, step: 10, unit: "ms", group: "Blink" },
  { key: "longBlinkMs", label: "Long blink", min: 200, max: 2000, step: 50, unit: "ms", group: "Blink" },
  { key: "longBlinkMaxMs", label: "Long blink max", min: 1000, max: 6000, step: 100, unit: "ms", group: "Blink" },

  { key: "nodThreshold", label: "Nod threshold", min: 0.05, max: 0.8, step: 0.01, group: "Head gestures" },
  { key: "nodMaxDurationMs", label: "Nod max duration", min: 300, max: 3000, step: 50, unit: "ms", group: "Head gestures" },
  { key: "shakeThreshold", label: "Shake threshold", min: 0.05, max: 0.8, step: 0.01, group: "Head gestures" },
  { key: "shakeMaxDurationMs", label: "Shake max duration", min: 300, max: 3000, step: 50, unit: "ms", group: "Head gestures" },
  { key: "gestureRefractoryMs", label: "Refractory", min: 0, max: 2000, step: 50, unit: "ms", group: "Head gestures" },
  { key: "gestureCenterTolerance", label: "Start-from-center tol.", min: 0.02, max: 0.5, step: 0.01, group: "Head gestures" },

  { key: "mouthOpenThreshold", label: "Mouth open above", min: 0.1, max: 0.9, step: 0.01, group: "Mouth" },
  { key: "mouthHoldMs", label: "Mouth hold", min: 100, max: 3000, step: 50, unit: "ms", group: "Mouth" },
  { key: "mouthSpeechStd", label: "Speech guard (std)", min: 0.01, max: 0.3, step: 0.005, group: "Mouth" },

  { key: "browRaiseThreshold", label: "Brow raise above", min: 0.1, max: 0.9, step: 0.01, group: "Brows" },
  { key: "browMinMs", label: "Brow min duration", min: 50, max: 2000, step: 50, unit: "ms", group: "Brows" },

  { key: "lookAwayThreshold", label: "Look away beyond", min: 0.3, max: 1, step: 0.01, group: "Attention" },
  { key: "lookAwayMs", label: "Look away duration", min: 100, max: 3000, step: 50, unit: "ms", group: "Attention" },
  { key: "trackingLostMs", label: "Tracking lost after", min: 50, max: 2000, step: 50, unit: "ms", group: "Attention" },

  { key: "headYawRangeDeg", label: "Yaw range (±deg = ±1)", min: 5, max: 60, step: 1, unit: "°", group: "Head range" },
  { key: "headPitchRangeDeg", label: "Pitch range", min: 5, max: 60, step: 1, unit: "°", group: "Head range" },
  { key: "headRollRangeDeg", label: "Roll range", min: 5, max: 60, step: 1, unit: "°", group: "Head range" },

  { key: "pointerGainX", label: "Pointer gain X", min: 0.2, max: 4, step: 0.1, group: "Pointer" },
  { key: "pointerGainY", label: "Pointer gain Y", min: 0.2, max: 4, step: 0.1, group: "Pointer" },
  { key: "eyeBlendWeight", label: "Eye blend (experimental)", min: 0, max: 1, step: 0.05, group: "Pointer" },

  { key: "headStepThreshold", label: "Step threshold", min: 0.2, max: 1, step: 0.05, group: "Discrete nav" },
  { key: "headStepRepeatMs", label: "Step repeat", min: 200, max: 2000, step: 50, unit: "ms", group: "Discrete nav" },

  { key: "gridSensitivity", label: "Sensitivity", min: 0.1, max: 4, step: 0.05, group: "Grid glide" },
  { key: "gridAcceleration", label: "Acceleration", min: 0, max: 3, step: 0.05, group: "Grid glide" },
  { key: "gridDeadZone", label: "Dead zone (head speed)", min: 0, max: 2, step: 0.05, unit: "u/s", group: "Grid glide" },
  { key: "gridHysteresis", label: "Cell hysteresis", min: 0, max: 0.7, step: 0.01, group: "Grid glide" },
  { key: "gridSettleMs", label: "Settle time", min: 0, max: 1000, step: 10, unit: "ms", group: "Grid glide" },
  { key: "gridSettleVelocity", label: "Settle velocity", min: 0.05, max: 2, step: 0.05, group: "Grid glide" },

  { key: "scrollBlinkCount", label: "Blinks to toggle", min: 2, max: 6, step: 1, group: "Head scroll" },
  { key: "scrollBlinkWindowMs", label: "Blink burst window", min: 400, max: 3000, step: 50, unit: "ms", group: "Head scroll" },
  { key: "scrollDeadzone", label: "Dead zone (head tilt)", min: 0, max: 0.5, step: 0.01, group: "Head scroll" },
  { key: "scrollMaxSpeed", label: "Max scroll speed", min: 100, max: 3000, step: 50, unit: "px/s", group: "Head scroll" },
  { key: "scrollCurve", label: "Speed curve", min: 0.5, max: 3, step: 0.1, group: "Head scroll" },
  { key: "scrollPageIntervalMs", label: "Fastest page turn", min: 60, max: 1000, step: 20, unit: "ms", group: "Head scroll" },
];
