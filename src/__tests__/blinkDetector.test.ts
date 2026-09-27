import { describe, expect, it } from "vitest";
import { BlinkDetector } from "@/gestures/blinkDetector";
import { ctx, sequence } from "./helpers";

const closure = (from: number, to: number) => (t: number) => (t >= from && t < to ? { leftEyeOpenness: 0.05, rightEyeOpenness: 0.08 } : {});

function run(frames: ReturnType<typeof sequence>) {
  const d = new BlinkDetector();
  return frames.flatMap((s) => d.update(s, ctx()));
}

describe("BlinkDetector", () => {
  it("classifies a short closure as BLINK, never LONG_BLINK", () => {
    const events = run(sequence(0, 2000, 16, closure(500, 650)));
    expect(events.map((e) => e.type)).toEqual(["BLINK"]);
    expect(events[0].duration).toBeGreaterThanOrEqual(140);
  });

  it("classifies a closure ≥ longBlinkMs as LONG_BLINK", () => {
    const events = run(sequence(0, 2000, 16, closure(500, 1200)));
    expect(events.map((e) => e.type)).toEqual(["LONG_BLINK"]);
    expect(events[0].confidence).toBeGreaterThan(0.3);
  });

  it("ignores very short flickers and over-long closures", () => {
    expect(run(sequence(0, 1000, 16, closure(500, 520)))).toEqual([]);
    expect(run(sequence(0, 5000, 16, closure(500, 3500)))).toEqual([]);
  });

  it("requires both eyes closed (a wink is not a blink)", () => {
    const events = run(sequence(0, 2000, 16, (t) => (t >= 500 && t < 1300 ? { leftEyeOpenness: 0.05, rightEyeOpenness: 0.9 } : {})));
    expect(events).toEqual([]);
  });

  it("discards a closure interrupted by tracking loss", () => {
    const frames = sequence(0, 2000, 16, closure(500, 1300)).map((s) => (s.timestamp >= 900 && s.timestamp < 1000 ? { ...s, tracking: false } : s));
    const events = run(frames);
    expect(events.filter((e) => e.type === "LONG_BLINK")).toEqual([]);
  });
});
