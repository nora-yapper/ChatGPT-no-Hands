import { describe, expect, it } from "vitest";
import { GazeDetector } from "@/gestures/gazeDetector";
import { DEFAULT_THRESHOLDS as th } from "@/config/thresholds";

describe("GazeDetector", () => {
  it("emits ENTER, HOLD after gazeHoldMs, and EXIT", () => {
    const g = new GazeDetector();
    const types: string[] = [];
    for (let t = 0; t <= 2000; t += 16) {
      const target = t >= 100 && t < 1500 ? "btn" : null;
      types.push(...g.update(target, t, th, 0.9, true, "head").map((e) => e.type));
    }
    expect(types).toEqual(["GAZE_ENTER", "GAZE_HOLD", "GAZE_EXIT"]);
  });

  it("does not hold when the pointer flickers between targets (low stability)", () => {
    const g = new GazeDetector();
    const types: string[] = [];
    for (let t = 0; t <= 2000; t += 16) {
      const target = t >= 100 ? (Math.floor(t / 48) % 3 === 0 ? "other" : "btn") : null;
      types.push(...g.update(target, t, th, 0.9, true, "head").map((e) => e.type));
    }
    expect(types).not.toContain("GAZE_HOLD");
  });

  it("emits EXIT and resets on tracking loss", () => {
    const g = new GazeDetector();
    g.update("btn", 0, th, 0.9, true, "head");
    const ev = g.update("btn", 100, th, 0.9, false, "head");
    expect(ev.map((e) => e.type)).toEqual(["GAZE_EXIT"]);
    expect(g.targetId).toBeNull();
  });
});
