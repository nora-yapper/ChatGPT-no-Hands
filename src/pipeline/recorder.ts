import type { Signals } from "@/types/signals";

export interface RecordedFrame {
  t: number; // ms relative to recording start
  raw: Signals;
  smoothed: Signals;
}

export interface Recording {
  version: 1;
  createdAt: string;
  frames: RecordedFrame[];
}

/** Records the normalized signal stream (never video) so gestures can be replayed through the pipeline. */
export class SignalRecorder {
  private frames: RecordedFrame[] = [];
  private startAt = 0;
  recording = false;

  start(now: number) {
    this.frames = [];
    this.startAt = now;
    this.recording = true;
  }

  stop() {
    this.recording = false;
  }

  push(raw: Signals, smoothed: Signals) {
    if (!this.recording) return;
    this.frames.push({ t: raw.timestamp - this.startAt, raw, smoothed });
  }

  get length() {
    return this.frames.length;
  }

  getFrames() {
    return this.frames;
  }

  toJSON(): Recording {
    return { version: 1, createdAt: new Date().toISOString(), frames: this.frames };
  }

  load(rec: Recording) {
    this.frames = rec.frames;
    this.recording = false;
  }
}
