import type { TrackingFrame, TrackingProvider } from "@/types/tracking";
import type { Signals, CalibrationBaseline } from "@/types/signals";
import type { InputEvent } from "@/events/types";
import { EventBus } from "@/events/eventBus";
import { normalizeSignals } from "@/signals/normalizeSignals";
import { SignalSmoother } from "@/signals/smoothSignals";
import { computePointer } from "@/signals/pointer";
import { StableHeadPose } from "@/signals/stableHeadPose";
import { CalibrationSession, DEFAULT_BASELINE } from "@/signals/calibration";
import { TrackingQualityEstimator } from "@/quality/trackingQuality";
import { BlinkDetector } from "@/gestures/blinkDetector";
import { HeadGestureDetector } from "@/gestures/headGestureDetector";
import { MouthDetector } from "@/gestures/mouthDetector";
import { EyebrowDetector } from "@/gestures/eyebrowDetector";
import { LookAwayDetector } from "@/gestures/lookAwayDetector";
import { HeadStepDetector, type StepDirection } from "@/gestures/headStepDetector";
import { GazeDetector } from "@/gestures/gazeDetector";
import { ScrollToggleDetector } from "@/gestures/scrollToggleDetector";
import { HeadScrollController } from "@/gestures/headScrollController";
import type { Detector } from "@/gestures/Detector";
import { FocusManager } from "@/interaction/focusManager";
import { GridNavigator, type GridLayout } from "@/interaction/gridNavigator";
import { InteractionStateMachine } from "@/interaction/InteractionStateMachine";
import { ActionDispatcher } from "@/interaction/actionDispatcher";
import { labStore, type LabStore } from "@/store/labStore";
import { settingsStore } from "@/store/settingsStore";
import { SignalRecorder, type Recording } from "./recorder";

/**
 * Orchestrates RAW FRAME → SIGNALS → GESTURES → INTERACTION → ACTIONS.
 * Pure w.r.t. React: it only writes to the LabStore and the EventBus.
 */
export class Pipeline {
  readonly bus: EventBus;
  readonly focus = new FocusManager();
  readonly dispatcher = new ActionDispatcher();
  readonly recorder = new SignalRecorder();
  /** blink-burst-toggled continuous head-pitch scrolling; the GUI registers its scrollable surface here */
  readonly headScroll = new HeadScrollController();

  private smoother = new SignalSmoother();
  private headPose = new StableHeadPose();
  private quality = new TrackingQualityEstimator();
  private detectors: Detector[] = [
    new BlinkDetector(),
    new HeadGestureDetector("NOD"),
    new HeadGestureDetector("HEAD_SHAKE"),
    new MouthDetector(),
    new EyebrowDetector(),
    new LookAwayDetector(),
  ];
  private headStep = new HeadStepDetector();
  private gaze = new GazeDetector();
  private scrollToggle = new ScrollToggleDetector();
  private grid = new GridNavigator();
  private fsm = new InteractionStateMachine();

  private provider: TrackingProvider | null = null;
  private unsubscribeProvider: (() => void) | null = null;
  private calibration: CalibrationSession | null = null;
  private lastFaceAt = 0;
  private trackingLost = true;
  private prevPointer: { x: number; y: number; t: number } | null = null;
  private pointerVelocity = 0;
  private fpsTimes: number[] = [];
  private replayTimer: ReturnType<typeof setTimeout> | null = null;
  private replayIndex = 0;
  private paused = false;

  constructor(private store: LabStore = labStore) {
    this.bus = new EventBus(settingsStore.get().maxEvents);
    settingsStore.subscribe(() => this.bus.setMaxEvents(settingsStore.get().maxEvents));
  }

  // ---------------------------------------------------------------- provider
  attachProvider(provider: TrackingProvider) {
    this.detachProvider();
    this.provider = provider;
    this.unsubscribeProvider = provider.onFrame((f) => this.handleFrame(f));
    this.store.update({ tracking: { ...this.store.latest.tracking, providerName: provider.name } });
  }

  detachProvider() {
    this.unsubscribeProvider?.();
    this.unsubscribeProvider = null;
    this.provider = null;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.provider?.setPaused(p);
    this.store.update({ paused: p });
  }

  isPaused() {
    return this.paused;
  }

  // ------------------------------------------------------------- calibration
  startCalibration(durationMs = 2000) {
    const now = performance.now();
    this.calibration = new CalibrationSession(now, durationMs);
    this.store.update({ calibration: { active: true, progress: 0, samples: 0 } });
  }

  cancelCalibration() {
    this.calibration = null;
    this.store.update({ calibration: { active: false, progress: 0, samples: 0 } });
  }

  private baseline(): CalibrationBaseline {
    return settingsStore.get().calibration ?? DEFAULT_BASELINE;
  }

  // ------------------------------------------------------------------ frames
  handleFrame(frame: TrackingFrame) {
    if (this.paused) return;
    const settings = settingsStore.get();
    const th = settings.thresholds;
    const t = frame.timestamp;

    // fps
    this.fpsTimes.push(t);
    while (this.fpsTimes.length && this.fpsTimes[0] < t - 1000) this.fpsTimes.shift();

    // head pose that ignores mouth/brow/smile deformation; everything downstream (calibration, pointer) reads it
    frame = { ...frame, stablePose: this.headPose.update(frame, this.baseline()) ?? undefined };

    // calibration capture
    if (this.calibration) {
      this.calibration.addFrame(frame);
      const progress = this.calibration.progress(t);
      this.store.update({ calibration: { active: true, progress, samples: this.calibration.sampleCount } });
      if (this.calibration.isComplete(t)) {
        const base = this.calibration.finish(t);
        this.calibration = null;
        if (base) {
          settingsStore.set({ calibration: base });
          this.smoother.reset();
          this.grid.recenter();
          this.bus.emit({ type: "CALIBRATED", timestamp: t, confidence: 1, source: "system", metadata: { samples: base.sampleCount, yawDeg: base.headYawDeg, pitchDeg: base.headPitchDeg, eyeOpenL: base.leftEyeOpen, eyeOpenR: base.rightEyeOpen } });
        } else {
          this.bus.emit({ type: "SYSTEM", timestamp: t, confidence: 0, source: "system", metadata: { note: "Calibration failed: face not detected long enough" } });
        }
        this.store.update({ calibration: { active: false, progress: 1, samples: base?.sampleCount ?? 0 } });
      }
    }

    // tracking-lost debounce
    if (frame.faceDetected) this.lastFaceAt = t;
    const lostNow = t - this.lastFaceAt > th.trackingLostMs || !frame.faceDetected && this.lastFaceAt === 0;
    if (lostNow && !this.trackingLost) {
      this.trackingLost = true;
      this.bus.emit({ type: "TRACKING_LOST", timestamp: t, confidence: 1, source: "system" });
      for (const d of this.detectors) d.reset();
      this.headStep.reset();
      this.grid.reset();
      this.smoother.reset();
      this.headPose.reset();
      this.quality.reset();
      this.scrollToggle.reset();
      this.headScroll.setActive(false);
    } else if (!lostNow && this.trackingLost && frame.faceDetected) {
      this.trackingLost = false;
      this.bus.emit({ type: "TRACKING_RECOVERED", timestamp: t, confidence: 1, source: "system" });
    }

    const quality = this.quality.update(frame);
    const raw0 = normalizeSignals(frame, this.baseline(), th);
    // treat a short dropout as still tracking (hold last smoothed values) but never as a fresh frame
    const raw = computePointer(raw0, th);
    const smoothed = computePointer(this.smoother.update(raw0, settings.smoothing), th);

    this.store.update({
      frame,
      raw,
      smoothed,
      quality,
      tracking: { ...this.store.latest.tracking, status: "running", fps: this.fpsTimes.length, inferenceMs: frame.inferenceMs, message: null },
    });
    this.processSignals(raw, smoothed, quality.overall, t);
    this.recorder.push(raw, smoothed);
    if (this.recorder.recording) this.store.update({ recorder: { ...this.store.latest.recorder, frames: this.recorder.length } });
  }

  /** Runs gesture + interaction layers on already-normalized signals (used by live frames and replay). */
  processSignals(raw: Signals, smoothed: Signals, qualityOverall: number, t: number) {
    const settings = settingsStore.get();
    const th = settings.thresholds;
    const tracking = smoothed.tracking && !this.trackingLost;
    const ctx = { thresholds: th, quality: this.store.latest.quality };

    // gesture detectors (always consume smoothed signals)
    const frameEvents: InputEvent[] = [];
    for (const d of this.detectors) {
      for (const e of d.update({ ...smoothed, tracking }, ctx)) frameEvents.push(this.bus.emit(e));
    }

    // head scroll: the configured gesture (settings.scrollToggleGesture) toggles it on/off; while on, head
    // pitch drives whatever scrollable surface the GUI has registered. Entirely independent of focus/confirm
    // — it never touches the FSM.
    // a gesture bound to an interaction intent (e.g. brows → CONFIRM) can't also toggle scrolling, or one raise would do both
    const toggleGesture = settings.scrollToggleGesture;
    const toggleFree = (settings.bindings[toggleGesture as keyof typeof settings.bindings] ?? "NONE") === "NONE";
    if (toggleFree && this.scrollToggle.observe(frameEvents, t, th, toggleGesture)) {
      const active = this.headScroll.toggle();
      this.bus.emit({ type: "SCROLL_MODE_TOGGLE", timestamp: t, confidence: 1, source: "eyes", metadata: { active, gesture: settings.scrollToggleGesture } });
    }
    this.headScroll.update({ ...smoothed, tracking }, t, th);

    // focus resolution
    let focusId: string | null = null;
    let gridMoving: boolean | null = null;
    if (tracking) {
      if (settings.focusMode === "pointer") {
        focusId = this.focus.hitTest(smoothed.pointerX, smoothed.pointerY);
        this.focus.setCurrent(focusId);
      } else if (settings.focusMode === "grid") {
        // glide over grid cells; only a cell the pointer has stopped on yields a focus target
        const g = this.grid.update({ ...smoothed, tracking }, t, th);
        for (const e of g.events) frameEvents.push(this.bus.emit(e));
        focusId = g.focusId;
        gridMoving = g.moving;
        this.focus.setCurrent(focusId);
      } else {
        for (const e of this.headStep.update({ ...smoothed, tracking }, ctx)) {
          const ev = this.bus.emit(e);
          const next = this.focus.step(ev.metadata?.direction as StepDirection);
          this.focus.setCurrent(next);
        }
        focusId = this.focus.getCurrentId();
      }
    } else {
      this.focus.setCurrent(null);
      this.grid.reset();
    }

    // pointer velocity (fraction of area per second) → "navigating"
    if (this.prevPointer && tracking) {
      const dt = Math.max(1, t - this.prevPointer.t) / 1000;
      const v = Math.hypot(smoothed.pointerX - this.prevPointer.x, smoothed.pointerY - this.prevPointer.y) / dt;
      this.pointerVelocity = this.pointerVelocity * 0.7 + v * 0.3;
    }
    this.prevPointer = { x: smoothed.pointerX, y: smoothed.pointerY, t };
    const pointerMoving = gridMoving ?? this.pointerVelocity > th.pointerMoveThreshold;

    // gaze / dwell over the focus target
    for (const e of this.gaze.update(focusId, t, th, qualityOverall, tracking, smoothed.pointerSource)) frameEvents.push(this.bus.emit(e));

    // interaction state machine
    const focusTarget = this.focus.getTarget(focusId);
    const result = this.fsm.update({ t, tracking, focus: focusTarget, pointerMoving, events: frameEvents, thresholds: th, bindings: settings.bindings });
    for (const e of result.events) this.bus.emit(e);
    for (const a of result.actions) this.dispatcher.dispatch(a);

    this.store.update({
      detectors: this.detectors.map((d) => d.getStatus()).concat(settings.focusMode === "discrete" ? [this.headStep.getStatus()] : settings.focusMode === "grid" ? [this.grid.getStatus(t, th)] : []),
      gaze: this.gaze.getStatus(t, th),
      grid: settings.focusMode === "grid" ? this.grid.getStatus(t, th) : null,
      headScroll: this.headScroll.getStatus(),
      interaction: this.fsm.getSnapshot(t),
      focusId,
      now: t,
    });
  }

  /** The GUI declares which target sits in which grid field (focus mode "grid"). */
  setGridLayout(layout: GridLayout) {
    this.grid.setLayout(layout);
  }

  /** Re-centre the grid cursor (relative input drifts like a mouse; calibration is a natural moment to reset). */
  recenterGrid() {
    this.grid.recenter();
  }

  /** Called by the UI when the user flags the last executed action as unintended. */
  markFalsePositive() {
    const last = this.bus.last("EXECUTE");
    const t = performance.now();
    if (last) this.bus.tag(last.id, { falsePositive: true });
    this.bus.emit({ type: "FALSE_POSITIVE", timestamp: t, confidence: 1, source: "system", metadata: { executeEventId: last?.id ?? null, action: last?.metadata?.action ?? null } });
  }

  resetInteraction() {
    const t = performance.now();
    this.fsm.reset(t);
    this.gaze.reset();
    this.grid.reset();
    for (const d of this.detectors) d.reset();
  }

  // ---------------------------------------------------------------- recorder
  startRecording() {
    this.recorder.start(performance.now());
    this.store.update({ recorder: { ...this.store.latest.recorder, recording: true, frames: 0 } });
  }

  stopRecording() {
    this.recorder.stop();
    this.store.update({ recorder: { ...this.store.latest.recorder, recording: false, frames: this.recorder.length } });
  }

  loadRecording(rec: Recording) {
    this.recorder.load(rec);
    this.store.update({ recorder: { ...this.store.latest.recorder, frames: this.recorder.length } });
  }

  /** Replays recorded signals through the gesture/interaction layers in (approximately) real time. */
  startReplay() {
    const frames = this.recorder.getFrames();
    if (!frames.length) return;
    this.stopReplay();
    this.setPaused(true); // do not mix live frames into the replay
    this.replayIndex = 0;
    const base = performance.now();
    this.bus.emit({ type: "SYSTEM", timestamp: base, confidence: 1, source: "system", metadata: { note: `Replay started (${frames.length} frames)` } });
    this.store.update({ recorder: { ...this.store.latest.recorder, replaying: true, replayIndex: 0 } });
    const step = () => {
      const f = frames[this.replayIndex];
      if (!f) {
        this.stopReplay();
        return;
      }
      const t = base + f.t;
      const raw = { ...f.raw, timestamp: t };
      const smoothed = { ...f.smoothed, timestamp: t };
      this.trackingLost = !smoothed.tracking;
      this.store.update({ raw, smoothed, recorder: { ...this.store.latest.recorder, replayIndex: this.replayIndex } });
      this.processSignals(raw, smoothed, this.store.latest.quality.overall || 0.8, t);
      this.replayIndex++;
      const next = frames[this.replayIndex];
      const delay = next ? Math.max(0, base + next.t - performance.now()) : 0;
      this.replayTimer = setTimeout(step, delay);
    };
    step();
  }

  stopReplay() {
    if (this.replayTimer) clearTimeout(this.replayTimer);
    this.replayTimer = null;
    if (this.store.latest.recorder.replaying) {
      this.store.update({ recorder: { ...this.store.latest.recorder, replaying: false } });
      this.setPaused(false);
      this.bus.emit({ type: "SYSTEM", timestamp: performance.now(), confidence: 1, source: "system", metadata: { note: "Replay stopped" } });
    }
  }
}

export const pipeline = new Pipeline();
