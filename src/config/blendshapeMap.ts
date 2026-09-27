/**
 * MediaPipe Face Landmarker blendshape names (ARKit-compatible, 52 total incl. _neutral).
 * "Left"/"Right" refer to the subject's own left/right.
 * Verified against mediapipe/tasks/cc/vision/face_landmarker/face_blendshapes_graph.cc.
 */
export const BLENDSHAPE = {
  browDownLeft: "browDownLeft",
  browDownRight: "browDownRight",
  browInnerUp: "browInnerUp",
  browOuterUpLeft: "browOuterUpLeft",
  browOuterUpRight: "browOuterUpRight",
  eyeBlinkLeft: "eyeBlinkLeft",
  eyeBlinkRight: "eyeBlinkRight",
  eyeLookDownLeft: "eyeLookDownLeft",
  eyeLookDownRight: "eyeLookDownRight",
  eyeLookInLeft: "eyeLookInLeft",
  eyeLookInRight: "eyeLookInRight",
  eyeLookOutLeft: "eyeLookOutLeft",
  eyeLookOutRight: "eyeLookOutRight",
  eyeLookUpLeft: "eyeLookUpLeft",
  eyeLookUpRight: "eyeLookUpRight",
  eyeSquintLeft: "eyeSquintLeft",
  eyeSquintRight: "eyeSquintRight",
  eyeWideLeft: "eyeWideLeft",
  eyeWideRight: "eyeWideRight",
  jawOpen: "jawOpen",
  mouthClose: "mouthClose",
  mouthSmileLeft: "mouthSmileLeft",
  mouthSmileRight: "mouthSmileRight",
  mouthPucker: "mouthPucker",
  mouthFunnel: "mouthFunnel",
} as const;

export const ALL_BLENDSHAPES = [
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
  "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight",
  "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
  "eyeWideLeft", "eyeWideRight",
  "jawForward", "jawLeft", "jawOpen", "jawRight",
  "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel",
  "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker",
  "mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft",
  "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight",
  "noseSneerLeft", "noseSneerRight",
] as const;
