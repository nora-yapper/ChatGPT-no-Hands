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
 *
 * `motionRef`: when the area is bigger than the region the glide speed was tuned for (the whole window, so
 * the sidebar is reachable), pass that region — head movement is scaled so it covers the same pixels as if
 * the region were the area.
 */
export function useMeasuredGrid(areaRef: RefObject<HTMLElement | null>, active: boolean, key: string, snap?: number, motionRef?: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!active) return;
    // The area may be an *ancestor's* element (the whole window, owned by the page). React attaches a parent's
    // ref only after its children's layout effects have run, so on mount it can still be null here: read it
    // lazily, and start observing it as soon as it exists (at the latest on the next frame).
    let ro: ResizeObserver | null = null;
    const observe = () => {
      const el = areaRef.current;
      if (!el || ro) return;
      ro = new ResizeObserver(measure);
      ro.observe(el);
    };
    const measure = () => {
      const el = areaRef.current;
      if (!el) return;
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
      const m = motionRef?.current?.getBoundingClientRect();
      const motionScale = m && m.width && m.height ? { x: m.width / a.width, y: m.height / a.height } : undefined;
      pipeline.setGridLayout({ ...layoutFromRects(rects, snap), motionScale });
    };
    observe();
    measure();
    const raf = requestAnimationFrame(() => { observe(); measure(); }); // after refs attach, fonts / layout settle
    const late = setTimeout(measure, 400); // after enter animations
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      pipeline.setGridLayout({ rows: [] });
    };
  }, [areaRef, active, key, snap, motionRef]);
}
