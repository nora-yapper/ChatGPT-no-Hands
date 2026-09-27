"use client";

import { useLayoutEffect, type RefObject } from "react";
import { pipeline } from "@/pipeline/Pipeline";
import { layoutFromRects } from "@/interaction/gridNavigator";

/** Each field is grown by this many px on every side (half a typical gap) so the gaps between buttons belong to a neighbour. */
const PAD_PX = 4;

/**
 * Grid Glide fields that are the buttons themselves. Every `[data-target]` (and `[data-grid-empty]` for a
 * deliberate empty field such as the current-text panel) inside the area is measured and declared as a
 * field in 0..1 area coordinates. Big buttons therefore get big fields, small ones small fields, and the
 * highlighted field always coincides with the control it activates.
 *
 * A control can claim a larger field than its own box: an element `[data-grid-field="<target id>"]`
 * supplies the field rectangle instead (used to let the input bar's Keyboard / Back / Send and the bottom
 * navigation cover the whole row, so there are no dead zones around important controls). Overrides apply
 * only while that target is registered. Re-measured on resize and whenever `key` changes.
 */
export function useMeasuredGrid(areaRef: RefObject<HTMLElement | null>, active: boolean, key: string, snap?: number) {
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el || !active) return;
    const measure = () => {
      const a = el.getBoundingClientRect();
      if (!a.width || !a.height) return;
      const nodes = [...el.querySelectorAll<HTMLElement>("[data-target],[data-grid-empty]")];
      const overrides = new Map<string, DOMRect>();
      for (const f of el.querySelectorAll<HTMLElement>("[data-grid-field]")) overrides.set(f.dataset.gridField!, f.getBoundingClientRect());
      const rects = nodes.map((n) => {
        const r = (n.dataset.target && overrides.get(n.dataset.target)) || n.getBoundingClientRect();
        const x0 = Math.max(a.left, r.left - PAD_PX);
        const y0 = Math.max(a.top, r.top - PAD_PX);
        const x1 = Math.min(a.right, r.right + PAD_PX);
        const y1 = Math.min(a.bottom, r.bottom + PAD_PX);
        return { id: n.dataset.target ?? null, x: (x0 - a.left) / a.width, y: (y0 - a.top) / a.height, w: (x1 - x0) / a.width, h: (y1 - y0) / a.height };
      });
      pipeline.setGridLayout(layoutFromRects(rects, snap));
    };
    measure();
    const raf = requestAnimationFrame(measure); // after fonts / layout settle
    const late = setTimeout(measure, 400); // after enter animations
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      pipeline.setGridLayout({ rows: [] });
    };
  }, [areaRef, active, key, snap]);
}
