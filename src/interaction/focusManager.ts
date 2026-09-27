import type { FocusTarget, Rect } from "@/types/interaction";
import type { StepDirection } from "@/gestures/headStepDetector";

interface Registered {
  target: FocusTarget;
  getRect: () => Rect | null;
}

/**
 * Registry of focusable GUI targets. Hit-tests the pointer (in viewport px) and supports
 * discrete stepping to the nearest neighbour. The GUI registers targets via useFocusable().
 */
export class FocusManager {
  private targets = new Map<string, Registered>();
  private currentId: string | null = null;
  /** viewport rect of the test area the 0..1 pointer maps onto */
  private areaRect: Rect | null = null;
  private listeners = new Set<() => void>();

  register(target: FocusTarget, getRect: () => Rect | null): () => void {
    this.targets.set(target.id, { target, getRect });
    this.notify();
    return () => {
      this.targets.delete(target.id);
      if (this.currentId === target.id) this.currentId = null;
      this.notify();
    };
  }

  setAreaRect(rect: Rect | null) {
    this.areaRect = rect;
  }

  getAreaRect() {
    return this.areaRect;
  }

  getTarget(id: string | null): FocusTarget | null {
    return id ? this.targets.get(id)?.target ?? null : null;
  }

  getCurrentId() {
    return this.currentId;
  }

  getCurrent(): FocusTarget | null {
    return this.getTarget(this.currentId);
  }

  setCurrent(id: string | null) {
    if (id !== this.currentId) {
      this.currentId = id;
      this.notify();
    }
  }

  /** Pointer in 0..1 area coordinates → viewport px. */
  pointerToViewport(px: number, py: number): { x: number; y: number } | null {
    const a = this.areaRect;
    if (!a) return null;
    return { x: a.left + px * a.width, y: a.top + py * a.height };
  }

  /** Returns the id of the target under the pointer (0..1 area coords), or null. */
  hitTest(px: number, py: number): string | null {
    const p = this.pointerToViewport(px, py);
    if (!p) return null;
    let best: { id: string; area: number } | null = null;
    for (const [id, r] of this.targets) {
      const rect = r.getRect();
      if (!rect) continue;
      if (p.x >= rect.left && p.x <= rect.left + rect.width && p.y >= rect.top && p.y <= rect.top + rect.height) {
        const area = rect.width * rect.height;
        if (!best || area < best.area) best = { id, area }; // prefer the smallest hit (nested targets)
      }
    }
    return best?.id ?? null;
  }

  /** Nearest target in the given direction from the current one (or the top-left-most if none). */
  step(dir: StepDirection): string | null {
    const entries = [...this.targets.entries()].map(([id, r]) => ({ id, rect: r.getRect() })).filter((e) => e.rect) as Array<{ id: string; rect: Rect }>;
    if (!entries.length) return null;
    const cur = this.currentId ? entries.find((e) => e.id === this.currentId) : undefined;
    if (!cur) {
      entries.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
      return entries[0].id;
    }
    const cx = cur.rect.left + cur.rect.width / 2;
    const cy = cur.rect.top + cur.rect.height / 2;
    let best: { id: string; score: number } | null = null;
    for (const e of entries) {
      if (e.id === cur.id) continue;
      const ex = e.rect.left + e.rect.width / 2;
      const ey = e.rect.top + e.rect.height / 2;
      const dx = ex - cx;
      const dy = ey - cy;
      let forward = 0;
      let lateral = 0;
      if (dir === "LEFT") { forward = -dx; lateral = Math.abs(dy); }
      else if (dir === "RIGHT") { forward = dx; lateral = Math.abs(dy); }
      else if (dir === "UP") { forward = -dy; lateral = Math.abs(dx); }
      else { forward = dy; lateral = Math.abs(dx); }
      if (forward <= 4) continue;
      const score = forward + lateral * 2.5;
      if (!best || score < best.score) best = { id: e.id, score };
    }
    return best?.id ?? cur.id;
  }

  /** The rect of a target in viewport px, for the overlay. */
  getRect(id: string | null): Rect | null {
    return id ? this.targets.get(id)?.getRect() ?? null : null;
  }

  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    for (const l of this.listeners) l();
  }
}
