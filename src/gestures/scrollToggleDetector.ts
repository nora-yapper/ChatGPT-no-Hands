import type { InputEvent, InputEventType } from "@/events/types";
import type { Thresholds } from "@/config/thresholds";

/** Which gesture toggles continuous head-driven scrolling on/off. */
export type ScrollToggleGesture = "BROW_RAISE_BOTH" | "MOUTH_HOLD" | "BLINK_BURST";

export const SCROLL_TOGGLE_GESTURES: ScrollToggleGesture[] = ["BROW_RAISE_BOTH", "MOUTH_HOLD", "BLINK_BURST"];

/**
 * Watches for the configured toggle gesture and reports the instant it fires — the toggle for continuous
 * head-driven scrolling (see HeadScrollController). BROW_RAISE_BOTH and MOUTH_HOLD are single, deliberate,
 * already-debounced events (EyebrowDetector/MouthDetector emit one per raise/hold episode), so those just
 * pass through. BLINK_BURST instead needs `scrollBlinkCount` fast blinks (BLINK, never LONG_BLINK — that's
 * already CONFIRM) landing within a rolling `scrollBlinkWindowMs` window.
 */
export class ScrollToggleDetector {
  readonly name = "scrollToggle";
  private blinkTimes: number[] = [];

  reset() {
    this.blinkTimes = [];
  }

  get blinkCount() {
    return this.blinkTimes.length;
  }

  /** Feed this frame's events; returns true the instant the configured gesture completes. */
  observe(events: InputEvent[], t: number, th: Thresholds, gesture: ScrollToggleGesture | InputEventType): boolean {
    if (gesture !== "BLINK_BURST") return events.some((ev) => ev.type === gesture);

    let fired = false;
    for (const ev of events) {
      if (ev.type !== "BLINK") continue;
      this.blinkTimes.push(t);
      this.blinkTimes = this.blinkTimes.filter((at) => t - at <= th.scrollBlinkWindowMs);
      if (this.blinkTimes.length >= th.scrollBlinkCount) {
        this.blinkTimes = [];
        fired = true;
      }
    }
    return fired;
  }
}
