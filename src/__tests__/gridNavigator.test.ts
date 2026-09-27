import { describe, expect, it } from "vitest";
import { GridNavigator, type GridLayout } from "@/interaction/gridNavigator";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/config/thresholds";
import { sig } from "./helpers";

const layout: GridLayout = {
  rows: [
    ["c0", "c1", "c2", "c3"],
    ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"],
    ["back", "space"],
  ],
};

const REL: Thresholds = { ...DEFAULT_THRESHOLDS, gridInput: "relative", gridSensitivity: 1, gridAcceleration: 0, gridDeadZone: 0.1, gridHysteresis: 0.2, gridSettleMs: 150, gridSettleVelocity: 0.3 };
const ABS: Thresholds = { ...REL, gridInput: "absolute", gridSensitivity: 2 };

function nav() {
  const g = new GridNavigator();
  g.setLayout(layout);
  return g;
}

/** Feeds head yaw/pitch at 16 ms steps; returns every update plus the flattened GRID_CELL events. */
function run(g: GridNavigator, head: (t: number) => [number, number], from: number, to: number, th = REL) {
  const focus: Array<string | null> = [];
  const events: string[] = [];
  let last = g.update(sig(from, { headYaw: head(from)[0], headPitch: head(from)[1] }), from, th);
  for (let t = from; t <= to; t += 16) {
    const [yaw, pitch] = head(t);
    last = g.update(sig(t, { headYaw: yaw, headPitch: pitch }), t, th);
    focus.push(last.focusId);
    events.push(...last.events.map((e) => `${e.metadata?.row}:${e.metadata?.target}`));
  }
  return { last, focus, events };
}

describe("GridNavigator (relative / mouse-like input)", () => {
  it("starts centred, does not focus while gliding, focuses the field it stops on", () => {
    const g = nav();
    // hold still first: centre of the middle row → k5 is under the cursor and should settle
    const idle = run(g, () => [0, 0], 0, 400);
    expect(idle.last.cell).toEqual({ row: 1, col: 5 });
    expect(idle.last.focusId).toBe("k5");
    // turn the head right over 300 ms (yaw 0 → 0.5 ⇒ cursor ≈ 0.5 + 0.5 minus the dead-zone shave, clamped to 1, at sensitivity 1)
    const glide = run(g, (t) => [Math.min(0.5, ((t - 400) / 300) * 0.5), 0], 416, 700);
    // settle hysteresis keeps the focus for the first frame or two until the velocity filter catches up
    expect(glide.focus.slice(3).every((f) => f === null)).toBe(true);
    expect(glide.last.moving).toBe(true);
    // stop: settle on the last field of the row
    const stop = run(g, () => [0.5, 0], 716, 1300);
    expect(stop.last.settled).toBe(true);
    expect(stop.last.cell).toEqual({ row: 1, col: 9 });
    expect(stop.last.focusId).toBe("k9");
  });

  it("returning the head to neutral moves the cursor back (relative deltas, no acceleration)", () => {
    const g = nav();
    run(g, () => [0, 0], 0, 200);
    run(g, (t) => [Math.min(0.3, (t - 200) / 1000), 0], 216, 520);
    const back = run(g, (t) => [Math.max(0, 0.3 - (t - 520) / 1000), 0], 536, 1400);
    expect(back.last.cell).toEqual({ row: 1, col: 5 });
    expect(back.last.focusId).toBe("k5");
  });

  it("acceleration makes a fast flick travel further than the same angle turned slowly", () => {
    const fast = nav();
    const slow = nav();
    const th = { ...REL, gridAcceleration: 1 };
    run(fast, () => [0, 0], 0, 100, th);
    run(slow, () => [0, 0], 0, 100, th);
    run(fast, (t) => [Math.min(0.2, ((t - 100) / 100) * 0.2), 0], 116, 300, th); // 0.2 in 100 ms
    run(slow, (t) => [Math.min(0.2, ((t - 100) / 1000) * 0.2), 0], 116, 1200, th); // 0.2 in 1 s
    expect(fast.getStatus(300, th).cursorX).toBeGreaterThan(slow.getStatus(1200, th).cursorX + 0.05);
  });

  it("ignores head jitter below the dead zone", () => {
    const g = nav();
    run(g, () => [0, 0], 0, 200);
    // alternating ±0.0005 = 0.001 per 16 ms frame = 0.06 u/s < dead zone 0.1
    const jitter = run(g, (t) => [(Math.floor(t / 16) % 2 ? 0.0005 : -0.0005), 0], 216, 1000);
    const st = g.getStatus(1000, REL);
    expect(Math.abs(st.cursorX - 0.5)).toBeLessThan(1e-6);
    expect(jitter.last.focusId).toBe("k5");
  });

  it("moves between rows with pitch and maps the cursor onto the row's own fields", () => {
    const g = nav();
    run(g, () => [0, 0], 0, 200);
    // pitch up 0.3 ⇒ cursor y 0.5 → 0.2 → top row; x stays 0.5 → c2 (4 fields: 0.5 → col 2)
    const up = run(g, (t) => [0, Math.min(0.3, (t - 200) / 1000)], 216, 520);
    const top = run(g, () => [0, 0.3], 536, 1100);
    expect(up.events).toEqual(["0:c2"]);
    expect(top.events).toEqual([]);
    expect(top.last.cell).toEqual({ row: 0, col: 2 });
    expect(top.last.focusId).toBe("c2");
  });

  it("keeps the field when wobbling across a boundary inside the hysteresis margin", () => {
    const g = nav();
    run(g, () => [0, 0], 0, 300); // k5 spans x 0.5..0.6; margin 0.2 * 0.1 = 0.02 each side
    const wobble = run(g, (t) => [Math.floor(t / 100) % 2 ? 0.08 : 0.115, 0], 316, 1200);
    expect(wobble.events).toEqual([]);
    expect(wobble.last.cell).toEqual({ row: 1, col: 5 });
  });

  it("re-centres on recenter() and resets on tracking loss", () => {
    const g = nav();
    run(g, (t) => [Math.min(0.4, t / 1000), 0], 0, 400);
    expect(g.getStatus(400, REL).cursorX).toBeGreaterThan(0.8);
    g.recenter();
    expect(g.getStatus(400, REL).cursorX).toBe(0.5);
    const lost = g.update(sig(416, { tracking: false }), 416, REL);
    expect(lost.cell).toBeNull();
    expect(lost.focusId).toBeNull();
    expect(g.getStatus(416, REL).phase).toBe("no cell");
  });

  it("drops a stale cell when the layout shrinks", () => {
    const g = nav();
    run(g, () => [0, 0], 0, 300);
    g.setLayout({ rows: [["only"]] });
    expect(g.getStatus(300, REL).cell).toBeNull();
    const after = run(g, () => [0, 0], 316, 700);
    expect(after.last.focusId).toBe("only");
  });
});

describe("GridNavigator (absolute input)", () => {
  it("maps head angle straight to the cursor with the sensitivity as gain", () => {
    const g = nav();
    const r = run(g, () => [0.25, 0], 0, 400, ABS); // 0.5 + 0.25 * 2 * 0.5 = 0.75 → col 7 of 10
    expect(g.getStatus(400, ABS).cursorX).toBeCloseTo(0.75);
    expect(r.last.focusId).toBe("k7");
  });
});

describe("GridNavigator (explicit fields from measured rectangles)", () => {
  it("infers rows and columns from rectangles and keeps the rectangles as fields", async () => {
    const { layoutFromRects } = await import("@/interaction/gridNavigator");
    const l = layoutFromRects([
      { id: "send", x: 0.8, y: 0.62, w: 0.15, h: 0.1 },
      { id: "nw", x: 0, y: 0, w: 0.3, h: 0.18 },
      { id: "n", x: 0.34, y: 0, w: 0.32, h: 0.18 },
      { id: "keyboard", x: 0.02, y: 0.62, w: 0.15, h: 0.1 },
      { id: "ne", x: 0.7, y: 0.01, w: 0.3, h: 0.18 },
    ]);
    expect(l.rows).toEqual([["nw", "n", "ne"], ["keyboard", "send"]]);
    expect(l.cells?.find((c) => c.id === "send")).toMatchObject({ row: 1, col: 1, x: 0.8, w: 0.15 });
  });

  it("focuses the field under the cursor, snaps to a nearby field across a gap, and finds no field far away", async () => {
    const { layoutFromRects } = await import("@/interaction/gridNavigator");
    const g = new GridNavigator();
    g.setLayout(layoutFromRects([
      { id: "big", x: 0.1, y: 0.1, w: 0.35, h: 0.3 },
      { id: "small", x: 0.7, y: 0.15, w: 0.1, h: 0.1 },
      { id: null, x: 0.35, y: 0.6, w: 0.3, h: 0.3 },
    ]));
    // absolute input: cursor = 0.5 + yaw*sensitivity*0.5 → yaw −0.5 puts the cursor at x=0.0 … use sensitivity 2
    const at = (x: number, y: number) => run(g, () => [(x - 0.5) / (ABS.gridSensitivity * 0.5), -(y - 0.5) / (ABS.gridSensitivity * 0.5)], 0, 400, ABS).last;
    expect(at(0.2, 0.2).focusId).toBe("big"); // inside the large field
    expect(at(0.47, 0.2).focusId).toBe("big"); // 2 % outside its right edge: snaps back to it
    g.reset();
    expect(at(0.5, 0.05).cell).toBeNull(); // far from every field
    g.reset();
    const empty = at(0.5, 0.75);
    expect(empty.settled).toBe(true);
    expect(empty.focusId).toBeNull(); // settled on the empty field: nothing focused
    expect(g.getStatus(400, ABS).cellRect).toEqual({ x: 0.35, y: 0.6, w: 0.3, h: 0.3 });
  });
});

describe("GridNavigator (base-grid layouts with deliberate empty space)", () => {
  it("does not snap across an empty gap when the layout's snap distance is small", async () => {
    const { layoutFromRects } = await import("@/interaction/gridNavigator");
    const rects = [
      { id: "left", x: 0, y: 0.8, w: 0.2, h: 0.2 },
      { id: "right", x: 0.8, y: 0.8, w: 0.2, h: 0.2 },
    ];
    const at = (g: GridNavigator, x: number, y: number) => run(g, () => [(x - 0.5) / (ABS.gridSensitivity * 0.5), -(y - 0.5) / (ABS.gridSensitivity * 0.5)], 0, 400, ABS).last;
    const loose = new GridNavigator();
    loose.setLayout(layoutFromRects(rects)); // default snap: 4 % beyond the field still lands on it
    expect(at(loose, 0.24, 0.9).focusId).toBe("left");
    const tight = new GridNavigator();
    tight.setLayout(layoutFromRects(rects, 0.012)); // base-grid snap: the gap is genuinely empty
    expect(at(tight, 0.24, 0.9).cell).toBeNull();
    expect(at(tight, 0.5, 0.9).cell).toBeNull();
    tight.reset();
    expect(at(tight, 0.1, 0.9).focusId).toBe("left");
  });
});

describe("GridNavigator (pull / stickiness tuning)", () => {
  it("defaults to a stronger hysteresis so small fields (like on-screen keys) resist face-tracking jitter", () => {
    expect(DEFAULT_THRESHOLDS.gridHysteresis).toBeGreaterThanOrEqual(0.35);
  });

  it("a higher gridHysteresis holds a field through more overshoot before a neighbour takes over", () => {
    const at = (g: GridNavigator, x: number, y: number, from: number, to: number, th: Thresholds) =>
      run(g, () => [(x - 0.5) / (ABS.gridSensitivity * 0.5), -(y - 0.5) / (ABS.gridSensitivity * 0.5)], from, to, th).last;

    const LOW: Thresholds = { ...ABS, gridHysteresis: 0.2 }; // the old default
    const HIGH: Thresholds = { ...ABS, gridHysteresis: DEFAULT_THRESHOLDS.gridHysteresis }; // the new, stronger pull

    const low = nav();
    at(low, 0.55, 0.5, 0, 200, LOW); // settle on k5 (spans x 0.5–0.6)
    const afterLow = at(low, 0.63, 0.5, 216, 400, LOW); // 3 % past its right edge — beyond the old 2 % margin
    expect(afterLow.cell).toEqual({ row: 1, col: 6 }); // escapes to k6

    const high = nav();
    at(high, 0.55, 0.5, 0, 200, HIGH);
    const afterHigh = at(high, 0.63, 0.5, 216, 400, HIGH); // same overshoot, inside the stronger margin
    expect(afterHigh.cell).toEqual({ row: 1, col: 5 }); // k5 holds on
  });
});

describe("GridNavigator motionScale", () => {
  it("scales relative head motion per axis, so a bigger area keeps the same pixel speed", () => {
    const turn = (t: number): [number, number] => [Math.min(0.3, (t / 300) * 0.3), 0]; // yaw 0 → 0.3 over 300 ms
    const plain = new GridNavigator();
    plain.setLayout(layout);
    run(plain, turn, 0, 400);
    const scaled = new GridNavigator();
    scaled.setLayout({ ...layout, motionScale: { x: 0.5, y: 1 } });
    run(scaled, turn, 0, 400);
    const travelled = (g: GridNavigator) => g.getStatus(400, REL).cursorX - 0.5;
    expect(travelled(plain)).toBeGreaterThan(0.1);
    expect(travelled(scaled)).toBeCloseTo(travelled(plain) / 2, 5);
  });
});
