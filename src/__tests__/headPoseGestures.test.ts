import { describe, expect, it } from "vitest";
import { HeadPoseGestureDetector } from "@/gestures/headPoseGestureDetector";
import { ctx, sequence } from "./helpers";

const run = (f: (t: number) => Record<string, number>, to = 2000) => {
  const d = new HeadPoseGestureDetector();
  return sequence(0, to, 16, f).flatMap((s) => d.update(s, ctx())).map((e) => e.type);
};

describe("HeadPoseGestureDetector", () => {
  it("fires once per held movement, per direction", () => {
    expect(run((t) => ({ headYaw: t >= 200 && t < 1200 ? 0.95 : 0 }))).toEqual(["TURN_RIGHT"]);
    expect(run((t) => ({ headYaw: t >= 200 && t < 1200 ? -0.95 : 0 }))).toEqual(["TURN_LEFT"]);
    expect(run((t) => ({ headPitch: t >= 200 && t < 1200 ? 0.95 : 0 }))).toEqual(["TILT_UP"]);
    expect(run((t) => ({ headPitch: t >= 200 && t < 1200 ? -0.95 : 0 }))).toEqual(["TILT_DOWN"]);
    expect(run((t) => ({ headRoll: t >= 200 && t < 1200 ? 0.95 : 0 }))).toEqual(["ROLL_RIGHT"]);
    expect(run((t) => ({ headRoll: t >= 200 && t < 1200 ? -0.95 : 0 }))).toEqual(["ROLL_LEFT"]);
  });

  it("ignores a movement that is not held long enough", () => {
    expect(run((t) => ({ headYaw: t >= 200 && t < 450 ? 0.95 : 0 }))).toEqual([]);
  });

  it("ignores ordinary pointing inside the threshold", () => {
    expect(run((t) => ({ headYaw: 0.6 * Math.sin(t / 300), headPitch: 0.5 * Math.cos(t / 250) }), 4000)).toEqual([]);
  });

  it("needs a return to centre before the next gesture", () => {
    // held for 2.5 s: one event, not one per hold period
    expect(run((t) => ({ headYaw: t >= 200 ? 0.95 : 0 }), 2700)).toEqual(["TURN_RIGHT"]);
    // out, back to centre, out again: two
    expect(run((t) => ({ headYaw: (t >= 200 && t < 900) || (t >= 1300 && t < 2000) ? 0.95 : 0 }), 2300)).toEqual(["TURN_RIGHT", "TURN_RIGHT"]);
  });

  it("uses only the dominant axis", () => {
    expect(run((t) => (t >= 200 && t < 1200 ? { headRoll: 0.95, headYaw: 0.5 } : { headRoll: 0, headYaw: 0 }))).toEqual(["ROLL_RIGHT"]);
  });
});
