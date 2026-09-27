/** Canonical MediaPipe 468/478-point face mesh indices used by the signal layer. */
export const LM = {
  noseTip: 1,
  chin: 152,
  forehead: 10,
  leftEyeOuter: 263, // subject's left
  leftEyeInner: 362,
  rightEyeOuter: 33, // subject's right
  rightEyeInner: 133,
  leftCheek: 454,
  rightCheek: 234,
  upperLip: 13,
  lowerLip: 14,
} as const;
