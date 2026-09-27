import type { TrackingFrame, TrackingProvider, TrackingStatus, Landmark } from "@/types/tracking";

type FaceLandmarkerT = import("@mediapipe/tasks-vision").FaceLandmarker;

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/models/face_landmarker.task";

/**
 * MediaPipe Face Landmarker implementation of TrackingProvider.
 * Runs entirely in the browser; wasm + model are served from /public.
 */
export class MediaPipeProvider implements TrackingProvider {
  readonly name = "MediaPipe Face Landmarker";
  private landmarker: FaceLandmarkerT | null = null;
  private video: HTMLVideoElement | null = null;
  private frame: TrackingFrame | null = null;
  private listeners = new Set<(f: TrackingFrame) => void>();
  private running = false;
  private paused = false;
  private status: TrackingStatus = "idle";
  private rafId: number | null = null;
  private lastVideoTime = -1;
  private lastTs = 0;
  delegateUsed: "GPU" | "CPU" = "GPU";
  error: string | null = null;

  getStatus() {
    return this.status;
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    this.status = "loading";
    const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    try {
      this.landmarker = await make("GPU");
      this.delegateUsed = "GPU";
    } catch (e) {
      console.warn("[MediaPipeProvider] GPU delegate failed, falling back to CPU", e);
      this.landmarker = await make("CPU");
      this.delegateUsed = "CPU";
    }
    this.running = true;
    this.status = "running";
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    const video = this.video;
    const lm = this.landmarker;
    if (video && lm && !this.paused && video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      let ts = performance.now();
      if (ts <= this.lastTs) ts = this.lastTs + 0.01; // MediaPipe requires monotonically increasing timestamps
      this.lastTs = ts;
      try {
        const t0 = performance.now();
        const res = lm.detectForVideo(video, ts);
        const inferenceMs = performance.now() - t0;
        this.frame = this.toFrame(res, ts, inferenceMs, video.videoWidth, video.videoHeight);
        for (const l of this.listeners) l(this.frame);
      } catch (e) {
        this.error = String(e);
        this.status = "error";
      }
    }
    const v = this.video as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | null;
    if (v && typeof v.requestVideoFrameCallback === "function") {
      v.requestVideoFrameCallback(() => this.loop());
    } else {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private toFrame(res: import("@mediapipe/tasks-vision").FaceLandmarkerResult, timestamp: number, inferenceMs: number, w: number, h: number): TrackingFrame {
    const lms = res.faceLandmarks?.[0];
    if (!lms || lms.length === 0) {
      return { timestamp, faceDetected: false, landmarks: [], blendshapes: {}, headMatrix: null, bbox: null, imageWidth: w, imageHeight: h, inferenceMs };
    }
    const landmarks: Landmark[] = lms.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of landmarks) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const blendshapes: Record<string, number> = {};
    for (const c of res.faceBlendshapes?.[0]?.categories ?? []) blendshapes[c.categoryName] = c.score;
    const matrix = res.facialTransformationMatrixes?.[0]?.data;
    return {
      timestamp,
      faceDetected: true,
      landmarks,
      blendshapes,
      headMatrix: matrix && matrix.length === 16 ? Array.from(matrix) : null,
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      imageWidth: w,
      imageHeight: h,
      inferenceMs,
    };
  }

  stop() {
    this.running = false;
    this.status = "idle";
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.frame = null;
    this.lastVideoTime = -1;
  }

  getFrame() {
    return this.frame;
  }

  onFrame(cb: (frame: TrackingFrame) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  isRunning() {
    return this.running;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (this.running) this.status = paused ? "paused" : "running";
  }
}
