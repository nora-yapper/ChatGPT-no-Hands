import { describe, expect, it } from "vitest";
import { ScrollToggleDetector } from "@/gestures/scrollToggleDetector";
import { DEFAULT_THRESHOLDS } from "@/config/thresholds";
import type { InputEvent } from "@/events/types";

const ev = (type: InputEvent["type"], t: number): InputEvent => ({ id: t, type, timestamp: t, confidence: 0.9, source: "face" });

describe("ScrollToggleDetector — BROW_RAISE_BOTH / MOUTH_HOLD", () => {
  it("fires the instant the configured gesture's event appears", () => {
    const d = new ScrollToggleDetector();
    expect(d.observe([ev("BROW_RAISE_LEFT", 0)], 0, DEFAULT_THRESHOLDS, "BROW_RAISE_BOTH")).toBe(false);
    expect(d.observe([ev("BROW_RAISE_BOTH", 100)], 100, DEFAULT_THRESHOLDS, "BROW_RAISE_BOTH")).toBe(true);
  });

  it("MOUTH_HOLD gesture ignores MOUTH_OPEN and only fires on MOUTH_HOLD", () => {
    const d = new ScrollToggleDetector();
    expect(d.observe([ev("MOUTH_OPEN", 0)], 0, DEFAULT_THRESHOLDS, "MOUTH_HOLD")).toBe(false);
    expect(d.observe([ev("MOUTH_HOLD", 500)], 500, DEFAULT_THRESHOLDS, "MOUTH_HOLD")).toBe(true);
  });

  it("fires again on a fresh episode of the same gesture (no burst counting needed)", () => {
    const d = new ScrollToggleDetector();
    expect(d.observe([ev("BROW_RAISE_BOTH", 0)], 0, DEFAULT_THRESHOLDS, "BROW_RAISE_BOTH")).toBe(true);
    expect(d.observe([ev("BROW_RAISE_BOTH", 2000)], 2000, DEFAULT_THRESHOLDS, "BROW_RAISE_BOTH")).toBe(true);
  });
});

describe("ScrollToggleDetector — BLINK_BURST", () => {
  const blink = (t: number) => ev("BLINK", t);
  const longBlink = (t: number) => ev("LONG_BLINK", t);

  it("fires once three fast blinks land within the window", () => {
    const d = new ScrollToggleDetector();
    expect(d.observe([blink(0)], 0, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(false);
    expect(d.observe([blink(300)], 300, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(false);
    expect(d.observe([blink(600)], 600, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(true);
  });

  it("does not fire when blinks are spread out past the window", () => {
    const d = new ScrollToggleDetector();
    expect(d.observe([blink(0)], 0, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(false);
    expect(d.observe([blink(800)], 800, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(false);
    // window is 1200ms from the *latest* blink; the first blink (t=0) is now out of range
    expect(d.observe([blink(2200)], 2200, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(false);
  });

  it("ignores LONG_BLINK — only fast blinks count toward a burst", () => {
    const d = new ScrollToggleDetector();
    d.observe([blink(0)], 0, DEFAULT_THRESHOLDS, "BLINK_BURST");
    d.observe([longBlink(200)], 200, DEFAULT_THRESHOLDS, "BLINK_BURST");
    expect(d.observe([blink(400)], 400, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(false);
  });

  it("resets the burst after firing, requiring a fresh set of blinks to toggle again", () => {
    const d = new ScrollToggleDetector();
    d.observe([blink(0)], 0, DEFAULT_THRESHOLDS, "BLINK_BURST");
    d.observe([blink(200)], 200, DEFAULT_THRESHOLDS, "BLINK_BURST");
    expect(d.observe([blink(400)], 400, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(true);
    expect(d.blinkCount).toBe(0);
    d.observe([blink(500)], 500, DEFAULT_THRESHOLDS, "BLINK_BURST");
    d.observe([blink(600)], 600, DEFAULT_THRESHOLDS, "BLINK_BURST");
    expect(d.observe([blink(700)], 700, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(true);
  });

  it("reset() clears any in-progress burst", () => {
    const d = new ScrollToggleDetector();
    d.observe([blink(0)], 0, DEFAULT_THRESHOLDS, "BLINK_BURST");
    d.observe([blink(200)], 200, DEFAULT_THRESHOLDS, "BLINK_BURST");
    d.reset();
    expect(d.blinkCount).toBe(0);
    expect(d.observe([blink(400)], 400, DEFAULT_THRESHOLDS, "BLINK_BURST")).toBe(false);
  });
});
