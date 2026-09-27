import { describe, expect, it } from "vitest";
import { MouthDetector } from "@/gestures/mouthDetector";
import { EyebrowDetector } from "@/gestures/eyebrowDetector";
import { ctx, sequence } from "./helpers";

describe("MouthDetector", () => {
  it("emits MOUTH_OPEN then MOUTH_HOLD for a steady hold", () => {
    const d = new MouthDetector();
    const events = sequence(0, 2000, 16, (t) => ({ mouthOpenness: t >= 300 && t < 1500 ? 0.8 : 0 })).flatMap((s) => d.update(s, ctx()));
    expect(events.map((e) => e.type)).toEqual(["MOUTH_OPEN", "MOUTH_HOLD"]);
    expect(events[1].duration).toBeGreaterThanOrEqual(500);
  });

  it("does not emit MOUTH_HOLD while the mouth oscillates (speaking)", () => {
    const d = new MouthDetector();
    const events = sequence(0, 3000, 16, (t) => ({ mouthOpenness: t >= 300 ? 0.65 + 0.3 * Math.sin(t / 40) : 0 })).flatMap((s) => d.update(s, ctx()));
    expect(events.filter((e) => e.type === "MOUTH_HOLD")).toEqual([]);
  });

  it("does not emit anything below the openness threshold", () => {
    const d = new MouthDetector();
    const events = sequence(0, 2000, 16, () => ({ mouthOpenness: 0.3 })).flatMap((s) => d.update(s, ctx()));
    expect(events).toEqual([]);
  });
});

describe("EyebrowDetector", () => {
  it("classifies both / left / right raises after the minimum duration", () => {
    const both = new EyebrowDetector();
    const e1 = sequence(0, 1500, 16, (t) => (t >= 200 ? { leftBrowRaise: 0.8, rightBrowRaise: 0.75 } : {})).flatMap((s) => both.update(s, ctx()));
    expect(e1.map((e) => e.type)).toEqual(["BROW_RAISE_BOTH"]);
    const left = new EyebrowDetector();
    const e2 = sequence(0, 1500, 16, (t) => (t >= 200 ? { leftBrowRaise: 0.8, rightBrowRaise: 0.1 } : {})).flatMap((s) => left.update(s, ctx()));
    expect(e2.map((e) => e.type)).toEqual(["BROW_RAISE_LEFT"]);
  });

  it("ignores a brief twitch shorter than browMinMs", () => {
    const d = new EyebrowDetector();
    const events = sequence(0, 1500, 16, (t) => (t >= 200 && t < 350 ? { leftBrowRaise: 0.9, rightBrowRaise: 0.9 } : {})).flatMap((s) => d.update(s, ctx()));
    expect(events).toEqual([]);
  });
});
