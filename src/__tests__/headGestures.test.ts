import { describe, expect, it } from "vitest";
import { HeadGestureDetector } from "@/gestures/headGestureDetector";
import { ctx, sequence } from "./helpers";

const bump = (from: number, to: number, amp: number) => (t: number) => {
  if (t < from || t > to) return 0;
  const p = (t - from) / (to - from);
  return Math.sin(Math.PI * p) * amp;
};

describe("NOD detector", () => {
  it("detects CENTER → DOWN → CENTER within the max duration", () => {
    const d = new HeadGestureDetector("NOD");
    const events = sequence(0, 2000, 16, (t) => ({ headPitch: -bump(500, 1000, 0.4)(t) })).flatMap((s) => d.update(s, ctx()));
    expect(events.map((e) => e.type)).toEqual(["NOD"]);
    expect(events[0].duration).toBeLessThan(1200);
  });

  it("does not fire when the head simply rests below neutral", () => {
    const d = new HeadGestureDetector("NOD");
    const events = sequence(0, 4000, 16, (t) => ({ headPitch: t > 500 ? -0.5 : 0 })).flatMap((s) => d.update(s, ctx()));
    expect(events).toEqual([]);
  });

  it("does not fire for an upward movement or a sub-threshold dip", () => {
    const up = new HeadGestureDetector("NOD");
    expect(sequence(0, 2000, 16, (t) => ({ headPitch: bump(500, 1000, 0.4)(t) })).flatMap((s) => up.update(s, ctx()))).toEqual([]);
    const small = new HeadGestureDetector("NOD");
    expect(sequence(0, 2000, 16, (t) => ({ headPitch: -bump(500, 1000, 0.1)(t) })).flatMap((s) => small.update(s, ctx()))).toEqual([]);
  });

  it("times out a slow dip that never returns in time", () => {
    const d = new HeadGestureDetector("NOD");
    const events = sequence(0, 4000, 16, (t) => ({ headPitch: -bump(500, 3500, 0.4)(t) })).flatMap((s) => d.update(s, ctx()));
    expect(events).toEqual([]);
  });
});

describe("HEAD_SHAKE detector", () => {
  it("detects CENTER → LEFT → RIGHT → CENTER", () => {
    const d = new HeadGestureDetector("HEAD_SHAKE");
    const events = sequence(0, 2500, 16, (t) => ({ headYaw: -bump(400, 800, 0.45)(t) + bump(800, 1200, 0.45)(t) })).flatMap((s) => d.update(s, ctx()));
    expect(events.map((e) => e.type)).toEqual(["HEAD_SHAKE"]);
  });

  it("does not fire for a single turn and return (looking sideways)", () => {
    const d = new HeadGestureDetector("HEAD_SHAKE");
    const events = sequence(0, 2500, 16, (t) => ({ headYaw: bump(400, 1000, 0.6)(t) })).flatMap((s) => d.update(s, ctx()));
    expect(events).toEqual([]);
  });

  it("respects the refractory period", () => {
    const d = new HeadGestureDetector("HEAD_SHAKE");
    const shake = (at: number) => (t: number) => -bump(at, at + 300, 0.5)(t) + bump(at + 300, at + 600, 0.5)(t);
    const events = sequence(0, 3000, 16, (t) => ({ headYaw: shake(300)(t) + shake(1000)(t) })).flatMap((s) => d.update(s, ctx()));
    expect(events.filter((e) => e.type === "HEAD_SHAKE").length).toBe(1);
  });
});
