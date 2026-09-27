import { useSyncExternalStore } from "react";
import type { TrackingFrame, TrackingStatus } from "@/types/tracking";
import type { Signals, TrackingQuality } from "@/types/signals";
import type { DetectorStatus } from "@/gestures/Detector";
import type { GazeStatus } from "@/gestures/gazeDetector";
import type { GridStatus } from "@/interaction/gridNavigator";
import type { HeadScrollStatus } from "@/gestures/headScrollController";
import type { StateSnapshot } from "@/interaction/InteractionStateMachine";
import { neutralSignals } from "@/signals/calibration";

export type CameraStatus = "idle" | "requesting" | "active" | "denied" | "error" | "unavailable";

export interface LabSnapshot {
  /** monotonically increasing */
  tick: number;
  now: number;
  camera: { status: CameraStatus; message: string | null; width: number; height: number };
  tracking: { status: TrackingStatus; message: string | null; fps: number; inferenceMs: number; providerName: string };
  frame: TrackingFrame | null;
  raw: Signals;
  smoothed: Signals;
  quality: TrackingQuality;
  detectors: DetectorStatus[];
  gaze: GazeStatus | null;
  /** grid glide navigator status (focus mode "grid" only) */
  grid: GridStatus | null;
  /** blink-burst-toggled continuous head-pitch scrolling */
  headScroll: HeadScrollStatus;
  interaction: StateSnapshot;
  focusId: string | null;
  calibration: { active: boolean; progress: number; samples: number };
  recorder: { recording: boolean; replaying: boolean; frames: number; replayIndex: number };
  paused: boolean;
  /** performance.now() when tracking was last started; basis for session statistics */
  sessionStart: number;
}

const EMPTY_QUALITY: TrackingQuality = {
  faceDetected: false, faceSize: "NONE", inFrame: "NONE", motion: "NONE", latency: "NONE", landmarks: "NONE", headPose: "NONE", overall: 0, issues: ["Not started"],
};

export function emptySnapshot(): LabSnapshot {
  return {
    tick: 0,
    now: 0,
    camera: { status: "idle", message: null, width: 0, height: 0 },
    tracking: { status: "idle", message: null, fps: 0, inferenceMs: 0, providerName: "" },
    frame: null,
    raw: neutralSignals(0),
    smoothed: neutralSignals(0),
    quality: EMPTY_QUALITY,
    detectors: [],
    gaze: null,
    grid: null,
    headScroll: { active: false, hasTarget: false, direction: 0, speed: 0 },
    interaction: { state: "IDLE", since: 0, armedTarget: null, focusTarget: null, lastAction: null, lastTransitionReason: "init", cooldownRemainingMs: 0 },
    focusId: null,
    calibration: { active: false, progress: 0, samples: 0 },
    recorder: { recording: false, replaying: false, frames: 0, replayIndex: 0 },
    paused: false,
    sessionStart: 0,
  };
}

/**
 * High-frequency state lives in `latest` (mutated by the pipeline at tracking rate).
 * React sees an immutable `snapshot` published at most every `publishIntervalMs`.
 */
export class LabStore {
  latest: LabSnapshot = emptySnapshot();
  private snapshot: LabSnapshot = this.latest;
  private listeners = new Set<() => void>();
  private lastPublish = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  publishIntervalMs = 50;

  /** Merge a partial update into latest and schedule a publish. */
  update(patch: Partial<LabSnapshot>) {
    Object.assign(this.latest, patch);
    this.latest.tick++;
    this.schedule();
  }

  private schedule() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const due = now - this.lastPublish;
    if (due >= this.publishIntervalMs) {
      this.publish();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.publish();
      }, this.publishIntervalMs - due);
    }
  }

  publish() {
    this.lastPublish = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.snapshot = { ...this.latest };
    for (const l of this.listeners) l();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.snapshot;
}

export const labStore = new LabStore();
const SERVER_SNAPSHOT = emptySnapshot();

/** Throttled (~20 Hz) React view of the lab state. */
export function useLab(): LabSnapshot {
  return useSyncExternalStore(labStore.subscribe, labStore.getSnapshot, () => SERVER_SNAPSHOT);
}
