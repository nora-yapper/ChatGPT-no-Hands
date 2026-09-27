import { describe, expect, it } from "vitest";
import { DEFAULT_ISNT, LEVELS, applyPreset, assign, commitConfirm, profileFor, resetMovement, revertConfirm, sanitize, shortcutFor, slotOf, stepLevel, type IsntSettings } from "@/isnt/isntSettings";

/** every gesture appears in at most one slot */
const conflictFree = (s: IsntSettings) => {
  const all = [s.confirm, ...Object.values(s.shortcuts).filter(Boolean)];
  return new Set(all).size === all.length;
};

describe("ISNT gesture map", () => {
  it("ships a conflict-free default", () => {
    expect(conflictFree(DEFAULT_ISNT)).toBe(true);
    expect(DEFAULT_ISNT.confirm).toBe("MOUTH_HOLD");
    expect(DEFAULT_ISNT.shortcuts.ACCOUNT).toBe("LONG_BLINK");
  });

  it("moves a gesture instead of mapping it to two actions", () => {
    const r = assign(DEFAULT_ISNT, "NEW_CHAT", "LONG_BLINK", 0);
    expect(r.ok).toBe(true);
    expect(r.moved).toBe("ACCOUNT");
    expect(r.settings.shortcuts.NEW_CHAT).toBe("LONG_BLINK");
    expect(r.settings.shortcuts.ACCOUNT).toBeNull();
    expect(conflictFree(r.settings)).toBe(true);
  });

  it("refuses the confirmation gesture for a shortcut, and head gestures or None for Confirm", () => {
    expect(assign(DEFAULT_ISNT, "SEND", "MOUTH_HOLD", 0).ok).toBe(false);
    expect(assign(DEFAULT_ISNT, "CONFIRM", "TURN_LEFT", 0).ok).toBe(false);
    expect(assign(DEFAULT_ISNT, "CONFIRM", null, 0).ok).toBe(false);
  });

  it("puts a new confirmation gesture on trial, and reverts or keeps it", () => {
    const r = assign(DEFAULT_ISNT, "CONFIRM", "BROW_RAISE_BOTH", 1000);
    expect(r.moved).toBe("SCROLL_TOGGLE"); // brows were the scroll toggle
    expect(r.settings.confirmTrial).toEqual({ previous: "MOUTH_HOLD", deadline: 21_000 });
    // a second change during the trial keeps the original, working fallback
    const twice = assign(r.settings, "CONFIRM", "LONG_BLINK", 2000).settings;
    expect(twice.confirmTrial?.previous).toBe("MOUTH_HOLD");
    expect(twice.shortcuts.ACCOUNT).toBeNull();
    const reverted = revertConfirm(twice);
    expect(reverted.confirm).toBe("MOUTH_HOLD");
    expect(reverted.confirmTrial).toBeNull();
    expect(conflictFree(reverted)).toBe(true);
    expect(commitConfirm(twice)).toMatchObject({ confirm: "LONG_BLINK", confirmTrial: null });
  });

  it("reverting takes the old gesture back from a shortcut it was given to meanwhile", () => {
    let s = assign(DEFAULT_ISNT, "CONFIRM", "LONG_BLINK", 0).settings;
    s = assign(s, "NEW_CHAT", "MOUTH_HOLD", 0).settings;
    s = revertConfirm(s);
    expect(s.confirm).toBe("MOUTH_HOLD");
    expect(s.shortcuts.NEW_CHAT).toBeNull();
    expect(conflictFree(s)).toBe(true);
  });

  it("presets are conflict-free and trial a changed confirm", () => {
    const s = applyPreset(DEFAULT_ISNT, "brows", 0);
    expect(conflictFree(s)).toBe(true);
    expect(s.confirm).toBe("BROW_RAISE_BOTH");
    expect(s.confirmTrial?.previous).toBe("MOUTH_HOLD");
    expect(applyPreset(DEFAULT_ISNT, "mouth", 0).confirmTrial).toBeNull();
  });

  it("maps fired gestures to shortcuts, but never the scroll toggle (the pipeline owns it)", () => {
    expect(shortcutFor(DEFAULT_ISNT, "ROLL_RIGHT")).toBe("SEND");
    expect(shortcutFor(DEFAULT_ISNT, "BROW_RAISE_BOTH")).toBeNull();
    expect(slotOf(DEFAULT_ISNT, "BROW_RAISE_BOTH")).toBe("SCROLL_TOGGLE");
  });
});

describe("ISNT sanitize", () => {
  it("repairs anything stored", () => {
    expect(sanitize(undefined)).toEqual(DEFAULT_ISNT);
    const s = sanitize({
      confirm: "TURN_LEFT", // a head gesture can't confirm → default
      shortcuts: { SEND: "MOUTH_HOLD", BACK: "ROLL_LEFT", NEW_CHAT: "ROLL_LEFT", KEYBOARD: "WINK" },
      levels: { pointerSpeed: 99, steadiness: -4, holdToArm: "x" },
      flipX: "yes",
    });
    expect(s.confirm).toBe("MOUTH_HOLD");
    expect(s.shortcuts.SEND).toBeNull(); // was the confirm gesture
    expect(s.shortcuts.BACK).toBe("ROLL_LEFT");
    expect(s.shortcuts.NEW_CHAT).toBeNull(); // duplicate
    expect(s.shortcuts.KEYBOARD).toBeNull(); // unknown
    expect(s.levels.pointerSpeed).toBe(LEVELS.find((l) => l.id === "pointerSpeed")!.display.length - 1);
    expect(s.levels.steadiness).toBe(0);
    expect(s.levels.holdToArm).toBe(DEFAULT_ISNT.levels.holdToArm);
    expect(s.flipX).toBe(false);
    expect(conflictFree(s)).toBe(true);
  });
});

describe("ISNT movement controls", () => {
  it("clamp at both ends of their safe steps", () => {
    let s = DEFAULT_ISNT;
    for (let i = 0; i < 20; i++) s = stepLevel(s, "steadiness", 1);
    expect(profileFor(s).thresholds.gridDeadZone).toBe(0.45);
    for (let i = 0; i < 20; i++) s = stepLevel(s, "headRange", -1);
    expect(profileFor(s).thresholds.headYawRangeDeg).toBe(12);
    expect(resetMovement(s).levels).toEqual(DEFAULT_ISNT.levels);
  });

  it("defaults reproduce today's tuning, with only the confirm gesture bound", () => {
    const p = profileFor(DEFAULT_ISNT);
    expect(p.thresholds).toMatchObject({ gridSensitivity: 0.9, gridDeadZone: 0.25, gridHysteresis: 0.4, gazeHoldMs: 500, headYawRangeDeg: 20, headPitchRangeDeg: 15, scrollMaxSpeed: 900, scrollDeadzone: 0.12, mouthOpenThreshold: 0.45, mouthHoldMs: 500, longBlinkMs: 600 });
    expect(p.smoothing.head).toBe(0.35);
    expect(Object.entries(p.bindings).filter(([, v]) => v !== "NONE")).toEqual([["MOUTH_HOLD", "CONFIRM"]]);
    expect(p.scrollToggle).toBe("BROW_RAISE_BOTH");
  });

  it("never lets a long blink get short enough to be a normal blink", () => {
    let s = DEFAULT_ISNT;
    for (let i = 0; i < 10; i++) s = stepLevel(s, "gestureHold", -1);
    expect(profileFor(s).thresholds.longBlinkMs).toBeGreaterThanOrEqual(360);
  });
});
