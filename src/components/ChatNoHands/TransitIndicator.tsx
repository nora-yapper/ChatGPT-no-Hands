"use client";

import { useEffect, useRef } from "react";
import { labStore } from "@/store/labStore";

/**
 * Minimal in-transit feedback for the head pointer: a small dot at its live position, plus a soft,
 * borderless tint over the grid cell it's currently gliding near — enough to orient by while moving
 * between controls, without the old bordered-rectangle grid overlay. The cell tint fades out the moment
 * a control settles into focus, since ChatFocusable's own shadow/fill takes over as the feedback from
 * there; the dot stays up throughout so where the pointer physically is is never a mystery.
 * Driven from the high-frequency store via rAF (like the old GridOverlay), so it stays smooth.
 */
export function TransitIndicator() {
  const cellRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cell = cellRef.current;
      const dot = dotRef.current;
      if (!cell || !dot) return;
      const { grid, smoothed } = labStore.latest;
      if (!grid || !smoothed.tracking || !grid.rows) {
        cell.style.opacity = "0";
        dot.style.display = "none";
        return;
      }
      dot.style.display = "block";
      dot.style.left = `${grid.cursorX * 100}%`;
      dot.style.top = `${grid.cursorY * 100}%`;

      // only tinted while gliding — once settled, the target itself (ChatFocusable) is the feedback
      if (!grid.cell || !grid.cellRect || grid.settled) {
        cell.style.opacity = "0";
        return;
      }
      const r = grid.cellRect;
      cell.style.left = `${r.x * 100}%`;
      cell.style.top = `${r.y * 100}%`;
      cell.style.width = `${r.w * 100}%`;
      cell.style.height = `${r.h * 100}%`;
      cell.style.opacity = `${0.05 + grid.settleProgress * 0.09}`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {/* z-46/47: above everything the pointer can be over, including in-place popups (Recents menu, settings
          chooser / More, expanded prompt — all z-[5]); what an open popup covers is no longer a head target,
          so the pointer is always over something visible and must be drawn on top of it. Below the pick glide
          ghost (z-50) and the keyboard modals (z-40 — while one is open this indicator isn't rendered; the
          modal draws its own). */}
      <div ref={cellRef} className="pointer-events-none absolute z-[46] rounded-2xl bg-foreground transition-opacity duration-100" style={{ opacity: 0 }} aria-hidden />
      <div
        ref={dotRef}
        className="pointer-events-none absolute z-[47] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ display: "none", width: 10, height: 10, background: "var(--foreground)", boxShadow: "0 0 0 2px var(--background), 0 1px 4px rgba(0,0,0,0.25)" }}
        aria-hidden
      />
    </>
  );
}
