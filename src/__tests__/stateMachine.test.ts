import { describe, expect, it } from "vitest";
import { InteractionStateMachine } from "@/interaction/InteractionStateMachine";
import { DEFAULT_THRESHOLDS as th } from "@/config/thresholds";
import { DEFAULT_BINDINGS } from "@/config/bindings";
import type { FocusTarget } from "@/types/interaction";
import type { InputEvent } from "@/events/types";

const target: FocusTarget = { id: "btn-delete", kind: "button", label: "DELETE", action: "DELETE" };
let id = 1;
const ev = (type: InputEvent["type"], t: number, meta: Record<string, unknown> = {}, duration?: number): InputEvent => ({ id: id++, type, timestamp: t, confidence: 0.9, duration, source: "eyes", metadata: meta });

function step(fsm: InteractionStateMachine, t: number, focus: FocusTarget | null, events: InputEvent[] = [], tracking = true, pointerMoving = false) {
  return fsm.update({ t, tracking, focus, pointerMoving, events, thresholds: th, bindings: DEFAULT_BINDINGS });
}

describe("InteractionStateMachine", () => {
  it("follows LOOK → FOCUS → HOLD → ARM → CONFIRM → ACTION → COOLDOWN", () => {
    const fsm = new InteractionStateMachine();
    step(fsm, 0, null);
    expect(fsm.getState()).toBe("IDLE");
    step(fsm, 10, null, [], true, true);
    expect(fsm.getState()).toBe("NAVIGATING");
    step(fsm, 20, target);
    expect(fsm.getState()).toBe("FOCUSED");
    step(fsm, 900, target, [ev("GAZE_HOLD", 900, { target: target.id }, 850)]);
    expect(fsm.getState()).toBe("ARMED");
    const r = step(fsm, 1500, target, [ev("LONG_BLINK", 1500, {}, 700)]);
    expect(fsm.getState()).toBe("CONFIRMING");
    expect(r.events.some((e) => e.type === "CONFIRM")).toBe(true);
    const r2 = step(fsm, 1700, target);
    expect(fsm.getState()).toBe("EXECUTING");
    expect(r2.actions.map((a) => a.action)).toEqual(["DELETE"]);
    expect(r2.actions[0].reason.triggerEvent).toBe("LONG_BLINK");
    expect(r2.events.some((e) => e.type === "EXECUTE")).toBe(true);
    step(fsm, 1900, target);
    expect(fsm.getState()).toBe("COOLDOWN");
    step(fsm, 1900 + th.cooldownMs + 10, target);
    expect(fsm.getState()).toBe("FOCUSED");
  });

  it("never executes from FOCUSED without ARMED (looking is not clicking)", () => {
    const fsm = new InteractionStateMachine();
    step(fsm, 0, target);
    const r = step(fsm, 100, target, [ev("LONG_BLINK", 100, {}, 700)]);
    expect(r.actions).toEqual([]);
    expect(fsm.getState()).toBe("FOCUSED");
  });

  it("ignores natural BLINK (bound to NONE) even when ARMED", () => {
    const fsm = new InteractionStateMachine();
    step(fsm, 0, target);
    step(fsm, 900, target, [ev("GAZE_HOLD", 900, { target: target.id }, 850)]);
    const r = step(fsm, 1000, target, [ev("BLINK", 1000, {}, 120)]);
    expect(r.actions).toEqual([]);
    expect(fsm.getState()).toBe("ARMED");
  });

  it("cancels on HEAD_SHAKE and never executes while tracking is lost", () => {
    const fsm = new InteractionStateMachine();
    step(fsm, 0, target);
    step(fsm, 900, target, [ev("GAZE_HOLD", 900, { target: target.id }, 850)]);
    const cancelled = step(fsm, 1000, target, [ev("HEAD_SHAKE", 1000, {}, 600)]);
    expect(cancelled.events.some((e) => e.type === "CANCEL")).toBe(true);
    expect(fsm.getState()).toBe("FOCUSED"); // disarmed but the target is still under the pointer
    expect(fsm.getSnapshot(1000).armedTarget).toBeNull();
    step(fsm, 1050, null);
    expect(fsm.getState()).toBe("IDLE");

    step(fsm, 1100, target);
    step(fsm, 2000, target, [ev("GAZE_HOLD", 2000, { target: target.id }, 850)]);
    expect(fsm.getState()).toBe("ARMED");
    const lost = step(fsm, 2100, target, [ev("LONG_BLINK", 2100, {}, 700)], false);
    expect(fsm.getState()).toBe("TRACKING_LOST");
    expect(lost.actions).toEqual([]);
    step(fsm, 2200, target, [ev("LONG_BLINK", 2200, {}, 700)]);
    expect(fsm.getState()).not.toBe("EXECUTING");
  });

  it("keeps ARMED during the grace period after the pointer leaves, then drops it", () => {
    const fsm = new InteractionStateMachine();
    step(fsm, 0, target);
    step(fsm, 900, target, [ev("GAZE_HOLD", 900, { target: target.id }, 850)]);
    step(fsm, 1000, null);
    expect(fsm.getState()).toBe("ARMED");
    const r = step(fsm, 1000 + th.armGraceMs - 50, null, [ev("NOD", 1500, {}, 500)]);
    expect(r.events.some((e) => e.type === "CONFIRM")).toBe(true);

    const fsm2 = new InteractionStateMachine();
    step(fsm2, 0, target);
    step(fsm2, 900, target, [ev("GAZE_HOLD", 900, { target: target.id }, 850)]);
    step(fsm2, 1000, null);
    step(fsm2, 1000 + th.armGraceMs + 50, null);
    expect(fsm2.getState()).toBe("IDLE");
  });

  it("ACTIVATE intent fires from FOCUSED without a hold", () => {
    const fsm = new InteractionStateMachine();
    step(fsm, 0, target);
    const r = fsm.update({ t: 100, tracking: true, focus: target, pointerMoving: false, events: [ev("MOUTH_HOLD", 100, {}, 600)], thresholds: th, bindings: { ...DEFAULT_BINDINGS, MOUTH_HOLD: "ACTIVATE" } });
    expect(fsm.getState()).toBe("CONFIRMING");
    expect(r.events.some((e) => e.type === "CONFIRM")).toBe(true);
  });
});
