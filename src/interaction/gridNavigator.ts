import type { DetectorStatus } from "@/gestures/Detector";
import type { NewInputEvent } from "@/events/types";
import type { Thresholds } from "@/config/thresholds";
import type { Signals } from "@/types/signals";
import { clamp01 } from "@/gestures/confidence";

export interface GridCell {
  col: number;
  row: number;
}

/**
 * Ragged grid of focus targets: one target id (or null for an empty field) per cell. Every row spans the
 * full width of the area, so rows may have different numbers of cells. The GUI declares this layout.
 */
export interface GridLayout {
  rows: Array<Array<string | null>>;
  /**
   * Optional explicit fields in 0..1 area coordinates. When present they define the geometry (fields may
   * differ in size and need not tile the area); `rows` then only names the targets per row for status and
   * events. Without `cells`, the rows are laid out as equal-height rows of equal-width fields.
   */
  cells?: LayoutCell[];
  /**
   * How far (fraction of the area) the cursor may be from every field and still count as on the nearest
   * one. Defaults to GRID_SNAP. Layouts with deliberate empty space between unrelated controls set a
   * small value so that space really is empty.
   */
  snap?: number;
  /**
   * Relative-glide scale per axis (default 1). A layout whose area is larger than the part of the screen the
   * glide speed was tuned for (e.g. the whole window, so the cursor can reach a sidebar) sets
   * tuned-size / area-size here, so a given head movement still covers the same distance in pixels.
   */
  motionScale?: { x: number; y: number };
}

/** One glide field: a rectangle in 0..1 area coordinates and the target it holds (null = empty field). */
export interface LayoutCell extends GridCell {
  id: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cursor further than this (fraction of the area) from every field counts as being on no field. */
export const GRID_SNAP = 0.06;

export const EMPTY_GRID_LAYOUT: GridLayout = { rows: [] };

/** Equal rows of equal fields — the geometry `rows` alone implies. */
export function cellsFromRows(rows: Array<Array<string | null>>): LayoutCell[] {
  const out: LayoutCell[] = [];
  const h = rows.length ? 1 / rows.length : 1;
  rows.forEach((r, row) => {
    const len = Math.max(1, r.length);
    for (let col = 0; col < len; col++) out.push({ id: r[col] ?? null, row, col, x: col / len, y: row * h, w: 1 / len, h });
  });
  return out;
}

/**
 * Build a layout from measured rectangles (e.g. the buttons' own bounding boxes). Rows are inferred by
 * clustering vertical centres, columns by horizontal order, so events and status stay meaningful.
 */
export function layoutFromRects(rects: Array<{ id: string | null; x: number; y: number; w: number; h: number }>, snap?: number): GridLayout {
  const sorted = [...rects].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const groups: Array<typeof sorted> = [];
  for (const r of sorted) {
    const g = groups.at(-1);
    const cy = r.y + r.h / 2;
    if (g) {
      const ref = g[0];
      const tol = Math.min(ref.h, r.h) * 0.5;
      if (Math.abs(ref.y + ref.h / 2 - cy) <= tol) { g.push(r); continue; }
    }
    groups.push([r]);
  }
  const cells: LayoutCell[] = [];
  const rows: Array<Array<string | null>> = [];
  groups.forEach((g, row) => {
    g.sort((a, b) => a.x - b.x);
    rows.push(g.map((r) => r.id));
    g.forEach((r, col) => cells.push({ ...r, row, col }));
  });
  return snap === undefined ? { rows, cells } : { rows, cells, snap };
}

export interface GridStatus extends DetectorStatus {
  rows: number;
  /** number of cells in each row */
  rowLengths: number[];
  /** continuous cursor in 0..1 area coordinates */
  cursorX: number;
  cursorY: number;
  /** cell the cursor is gliding over (with hysteresis), or null when not tracking / no layout */
  cell: GridCell | null;
  /** rectangle of `cell` in 0..1 area coordinates (for overlays) */
  cellRect: { x: number; y: number; w: number; h: number } | null;
  /** the cursor has been still on `cell` for gridSettleMs → the cell is the focus */
  settled: boolean;
  /** 0..1 progress toward settling */
  settleProgress: number;
  /** smoothed cursor velocity, fraction of the area per second */
  velocity: number;
  /** target in the settled cell, or null */
  targetId: string | null;
}

export interface GridUpdate {
  cell: GridCell | null;
  settled: boolean;
  /** cursor velocity above the settle velocity */
  moving: boolean;
  /** focus id to hand to the interaction layer: the cell's target while settled, else null */
  focusId: string | null;
  events: NewInputEvent[];
}

/** Velocity above this multiple of gridSettleVelocity breaks an existing settle (hysteresis against jitter). */
const UNSETTLE_FACTOR = 1.5;

/**
 * Grid glide navigation over a ragged grid of fields.
 *
 * Movement is interpreted like a mouse (gridInput = "relative"): the change in head yaw/pitch per frame,
 * not the absolute head angle, moves a continuous cursor. Sensitivity scales the movement, acceleration
 * makes fast turns travel further than slow ones (so a quick flick crosses the area and a slow return
 * barely moves the cursor), and a dead zone ignores head jitter. gridInput = "absolute" maps the head
 * angle to the cursor directly with the same sensitivity, for comparison.
 *
 * The cell under the cursor is highlighted while gliding but nothing is focused. Once the cursor is
 * still on a cell for gridSettleMs, the cell's target becomes the focus and the normal dwell → ARMED →
 * confirm ladder applies. Cell switches use hysteresis so jitter at a boundary does not flicker.
 */
export class GridNavigator {
  readonly name = "grid";
  private layout: GridLayout = EMPTY_GRID_LAYOUT;
  private cells: LayoutCell[] = [];
  private cx = 0.5;
  private cy = 0.5;
  private cell: GridCell | null = null;
  private stillSince: number | null = null;
  private settled = false;
  private prevHead: { yaw: number; pitch: number; t: number } | null = null;
  private prevCursor: { x: number; y: number; t: number } | null = null;
  private velocity = 0;
  private targetId: string | null = null;
  private last?: DetectorStatus["last"];

  setLayout(layout: GridLayout) {
    this.layout = layout;
    this.cells = layout.cells ?? cellsFromRows(layout.rows);
    if (this.cell && !this.find(this.cell)) {
      this.cell = null;
      this.settled = false;
      this.stillSince = null;
      this.targetId = null;
    }
  }

  getLayout() {
    return this.layout;
  }

  reset() {
    this.cx = 0.5;
    this.cy = 0.5;
    this.cell = null;
    this.stillSince = null;
    this.settled = false;
    this.prevHead = null;
    this.prevCursor = null;
    this.velocity = 0;
    this.targetId = null;
  }

  /** Re-centre the cursor without dropping the layout (e.g. after calibration). */
  recenter() {
    this.cx = 0.5;
    this.cy = 0.5;
    this.prevHead = null;
  }

  private find(cell: GridCell | null): LayoutCell | null {
    if (!cell) return null;
    return this.cells.find((c) => c.row === cell.row && c.col === cell.col) ?? null;
  }

  /** Distance from a point to a rectangle expanded by `margin` (0 when inside). */
  private static distance(c: LayoutCell, x: number, y: number, margin = 0): number {
    const dx = Math.max(c.x - margin - x, 0, x - (c.x + c.w + margin));
    const dy = Math.max(c.y - margin - y, 0, y - (c.y + c.h + margin));
    return Math.hypot(dx, dy);
  }

  /**
   * The field under the cursor. Containment uses half-open intervals so a point on a shared edge belongs
   * to the right / lower field (as in an equal grid); between fields, the nearest one within GRID_SNAP wins
   * (the smaller field on ties).
   */
  private cellAt(x: number, y: number): GridCell | null {
    if (!this.cells.length) return null;
    let best: LayoutCell | null = null;
    for (const c of this.cells) {
      const inside = x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h;
      if (inside && (!best || c.w * c.h < best.w * best.h)) best = c;
    }
    if (best) return { row: best.row, col: best.col };
    let bestD = Infinity;
    for (const c of this.cells) {
      const d = GridNavigator.distance(c, x, y);
      if (d < bestD || (d === bestD && best && c.w * c.h < best.w * best.h)) { best = c; bestD = d; }
    }
    return best && bestD <= (this.layout.snap ?? GRID_SNAP) ? { row: best.row, col: best.col } : null;
  }

  private targetOf(cell: GridCell | null): string | null {
    return this.find(cell)?.id ?? null;
  }

  update(s: Signals, t: number, th: Thresholds): GridUpdate {
    const out: NewInputEvent[] = [];
    if (!s.tracking) {
      this.reset();
      return { cell: null, settled: false, moving: false, focusId: null, events: out };
    }

    // ---- movement interpretation → cursor
    const sx = this.layout.motionScale?.x ?? 1;
    const sy = this.layout.motionScale?.y ?? 1;
    if (th.gridInput === "absolute") {
      this.cx = clamp01(0.5 + s.headYaw * th.gridSensitivity * 0.5 * sx);
      this.cy = clamp01(0.5 - s.headPitch * th.gridSensitivity * 0.5 * sy);
    } else if (this.prevHead) {
      const dt = Math.max(1, t - this.prevHead.t) / 1000;
      const dx = s.headYaw - this.prevHead.yaw;
      const dy = -(s.headPitch - this.prevHead.pitch); // pitch + = up = cursor toward the top
      const speed = Math.hypot(dx, dy) / dt; // normalized head units / s
      if (speed >= th.gridDeadZone) {
        // remove the dead zone so motion starts smoothly at the threshold, then apply gain + acceleration
        const usable = (speed - th.gridDeadZone) / speed;
        const gain = th.gridSensitivity * (1 + th.gridAcceleration * speed);
        this.cx = clamp01(this.cx + dx * usable * gain * sx);
        this.cy = clamp01(this.cy + dy * usable * gain * sy);
      }
    }
    this.prevHead = { yaw: s.headYaw, pitch: s.headPitch, t };

    // ---- cursor velocity (EMA, area fractions / s)
    if (this.prevCursor) {
      const dt = Math.max(1, t - this.prevCursor.t) / 1000;
      const v = Math.hypot(this.cx - this.prevCursor.x, this.cy - this.prevCursor.y) / dt;
      this.velocity = this.velocity * 0.7 + v * 0.3;
    }
    this.prevCursor = { x: this.cx, y: this.cy, t };

    // ---- glide cell with hysteresis: keep the current cell while the cursor is inside it expanded by the margin
    let next: GridCell | null = null;
    if (this.cells.length) {
      const cur = this.find(this.cell);
      // keep the current field while the cursor stays inside it grown by the hysteresis fraction of its size
      const keep = !!cur && this.cx >= cur.x - th.gridHysteresis * cur.w && this.cx <= cur.x + cur.w * (1 + th.gridHysteresis) && this.cy >= cur.y - th.gridHysteresis * cur.h && this.cy <= cur.y + cur.h * (1 + th.gridHysteresis);
      next = keep ? this.cell : this.cellAt(this.cx, this.cy);
    }
    const changed = (this.cell === null) !== (next === null) || (this.cell && next && (next.col !== this.cell.col || next.row !== this.cell.row));
    if (changed) {
      this.cell = next;
      this.stillSince = null;
      this.settled = false;
      this.targetId = null;
      if (next) {
        const target = this.targetOf(next);
        out.push({ type: "GRID_CELL", timestamp: t, confidence: 1, source: "head", metadata: { col: next.col, row: next.row, target, velocity: this.velocity, input: th.gridInput } });
        this.last = { type: `GRID_CELL ${next.col},${next.row}`, confidence: 1, at: t };
      }
    }

    // ---- settle detection
    const still = this.settled ? this.velocity <= th.gridSettleVelocity * UNSETTLE_FACTOR : this.velocity <= th.gridSettleVelocity;
    if (!still) {
      this.stillSince = null;
      this.settled = false;
      this.targetId = null;
    } else {
      if (this.stillSince === null) this.stillSince = t;
      if (!this.settled && t - this.stillSince >= th.gridSettleMs && this.cell) this.settled = true;
      if (this.settled) this.targetId = this.targetOf(this.cell);
    }

    return { cell: this.cell, settled: this.settled, moving: !still, focusId: this.settled ? this.targetId : null, events: out };
  }

  getStatus(t: number, th: Thresholds): GridStatus {
    const stillMs = this.stillSince === null ? 0 : t - this.stillSince;
    const cur = this.find(this.cell);
    const settleProgress = this.settled ? 1 : th.gridSettleMs > 0 ? clamp01(stillMs / th.gridSettleMs) : this.stillSince === null ? 0 : 1;
    return {
      name: this.name,
      active: !!this.cell,
      progress: settleProgress,
      durationMs: stillMs,
      phase: !this.cells.length ? "no layout" : !this.cell ? "no cell" : this.settled ? (this.targetId ? "settled" : "settled (empty field)") : this.stillSince === null ? "gliding" : "settling",
      thresholds: { gridSensitivity: th.gridSensitivity, gridAcceleration: th.gridAcceleration, gridDeadZone: th.gridDeadZone, gridSettleMs: th.gridSettleMs, gridSettleVelocity: th.gridSettleVelocity, gridHysteresis: th.gridHysteresis },
      last: this.last,
      rows: this.layout.rows.length,
      rowLengths: this.layout.rows.map((r) => r.length),
      cursorX: this.cx,
      cursorY: this.cy,
      cell: this.cell,
      cellRect: cur ? { x: cur.x, y: cur.y, w: cur.w, h: cur.h } : null,
      settled: this.settled,
      settleProgress,
      velocity: this.velocity,
      targetId: this.settled ? this.targetId : null,
    };
  }
}
