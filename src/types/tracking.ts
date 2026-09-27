/** Provider-agnostic tracking output. Nothing outside src/tracking may import MediaPipe. */
export interface Landmark {
  x: number; // normalized 0..1 image coords (unmirrored camera image)
  y: number;
  z: number;
}

export interface BoundingBox {
  x: number; // normalized 0..1
  y: number;
  w: number;
  h: number;
}

export interface TrackingFrame {
  /** performance.now() based ms timestamp */
  timestamp: number;
  faceDetected: boolean;
  landmarks: Landmark[];
  /** blendshape name -> 0..1 score (naming as reported by the provider) */
  blendshapes: Record<string, number>;
  /** 4x4 head transform (column-major, 16 numbers) or null if unavailable */
  headMatrix: number[] | null;
  bbox: BoundingBox | null;
  /**
   * Expression-independent head pose (deg), filled in by the pipeline (see signals/stableHeadPose.ts).
   * When present it takes precedence over headMatrix for the head pointer.
   */
  stablePose?: { yaw: number; pitch: number; roll: number; fromMatrix: boolean };
  imageWidth: number;
  imageHeight: number;
  /** provider inference time for this frame */
  inferenceMs: number;
}

export type TrackingStatus = "idle" | "loading" | "running" | "paused" | "error";

export interface TrackingProvider {
  readonly name: string;
  /** Load models and start producing frames from the given video element. */
  start(video: HTMLVideoElement): Promise<void>;
  stop(): void;
  getFrame(): TrackingFrame | null;
  onFrame(cb: (frame: TrackingFrame) => void): () => void;
  isRunning(): boolean;
  setPaused(paused: boolean): void;
  getStatus(): TrackingStatus;
}
