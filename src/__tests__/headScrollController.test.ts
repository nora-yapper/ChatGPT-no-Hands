import { describe, expect, it } from "vitest";
import { HeadScrollController, type ScrollTarget } from "@/gestures/headScrollController";
import { DEFAULT_THRESHOLDS } from "@/config/thresholds";
import { sig } from "./helpers";

function recordingTarget() {
  const deltas: number[] = [];
  const steps: Array<1 | -1> = [];
  const target: ScrollTarget = { scrollBy: (d) => deltas.push(d), step: (dir) => steps.push(dir) };
  return { target, deltas, steps };
}

describe("HeadScrollController", () => {
  it("does nothing while inactive, even with the head tilted and a target registered", () => {
    const c = new HeadScrollController();
    const { target, deltas } = recordingTarget();
    c.setTarget(target);
    c.update(sig(0, { headPitch: -0.5 }), 0, DEFAULT_THRESHOLDS);
    c.update(sig(100, { headPitch: -0.5 }), 100, DEFAULT_THRESHOLDS);
    expect(deltas).toEqual([]);
    expect(c.isActive()).toBe(false);
  });

  it("toggle() switches it on, and tilting the head down scrolls down (positive delta)", () => {
    const c = new HeadScrollController();
    const { target, deltas } = recordingTarget();
    c.setTarget(target);
    expect(c.toggle()).toBe(true);
    c.update(sig(0, { headPitch: -0.5 }), 0, DEFAULT_THRESHOLDS); // dt unknown on first tick → no delta yet
    c.update(sig(100, { headPitch: -0.5 }), 100, DEFAULT_THRESHOLDS);
    expect(deltas.length).toBe(1);
    expect(deltas[0]).toBeGreaterThan(0);
  });

  it("tilting the head up scrolls up (negative delta)", () => {
    const c = new HeadScrollController();
    const { target, deltas } = recordingTarget();
    c.setTarget(target);
    c.toggle();
    c.update(sig(0, { headPitch: 0.5 }), 0, DEFAULT_THRESHOLDS);
    c.update(sig(100, { headPitch: 0.5 }), 100, DEFAULT_THRESHOLDS);
    expect(deltas[0]).toBeLessThan(0);
  });

  it("stays silent inside the dead zone", () => {
    const c = new HeadScrollController();
    const { target, deltas } = recordingTarget();
    c.setTarget(target);
    c.toggle();
    c.update(sig(0, { headPitch: 0.02 }), 0, DEFAULT_THRESHOLDS);
    c.update(sig(100, { headPitch: 0.02 }), 100, DEFAULT_THRESHOLDS);
    expect(deltas).toEqual([]);
    expect(c.getStatus().speed).toBe(0);
  });

  it("scrolls faster the further past the dead zone the head is tilted", () => {
    const small = new HeadScrollController();
    const smallRec = recordingTarget();
    small.setTarget(smallRec.target);
    small.toggle();
    small.update(sig(0, { headPitch: -0.2 }), 0, DEFAULT_THRESHOLDS);
    small.update(sig(100, { headPitch: -0.2 }), 100, DEFAULT_THRESHOLDS);

    const big = new HeadScrollController();
    const bigRec = recordingTarget();
    big.setTarget(bigRec.target);
    big.toggle();
    big.update(sig(0, { headPitch: -0.9 }), 0, DEFAULT_THRESHOLDS);
    big.update(sig(100, { headPitch: -0.9 }), 100, DEFAULT_THRESHOLDS);

    expect(bigRec.deltas[0]).toBeGreaterThan(smallRec.deltas[0]);
  });

  it("pages a paginated target at most once per interval, faster at full deflection", () => {
    const c = new HeadScrollController();
    const { target, steps } = recordingTarget();
    c.setTarget(target);
    c.toggle();
    // full deflection: steps should repeat roughly every scrollPageIntervalMs
    for (let t = 0; t <= DEFAULT_THRESHOLDS.scrollPageIntervalMs * 3; t += 20) {
      c.update(sig(t, { headPitch: -0.95 }), t, DEFAULT_THRESHOLDS);
    }
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.every((d) => d === 1)).toBe(true);
  });

  it("toggling off (a second blink burst) stops scrolling immediately", () => {
    const c = new HeadScrollController();
    const { target, deltas } = recordingTarget();
    c.setTarget(target);
    c.toggle();
    c.update(sig(0, { headPitch: -0.5 }), 0, DEFAULT_THRESHOLDS);
    c.update(sig(100, { headPitch: -0.5 }), 100, DEFAULT_THRESHOLDS);
    expect(c.toggle()).toBe(false);
    c.update(sig(200, { headPitch: -0.5 }), 200, DEFAULT_THRESHOLDS);
    expect(deltas.length).toBe(1); // nothing appended after toggling off
    expect(c.getStatus().active).toBe(false);
  });

  it("loses tracking → stops driving the target without dropping the active flag", () => {
    const c = new HeadScrollController();
    const { target, deltas } = recordingTarget();
    c.setTarget(target);
    c.toggle();
    c.update(sig(0, { headPitch: -0.5, tracking: false }), 0, DEFAULT_THRESHOLDS);
    expect(deltas).toEqual([]);
    expect(c.isActive()).toBe(true);
  });
});
