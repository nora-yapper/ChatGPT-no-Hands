"use client";

import { useEffect, useRef } from "react";
import { labStore } from "@/store/labStore";

/**
 * Grid glide overlay: highlights the glide field (its own rectangle, so it always matches the target) and draws the cursor.
 * Driven from the high-frequency store via rAF (like the pointer crosshair) so it stays smooth.
 * The highlight is dashed while gliding, fills up while settling and turns solid once the field is focused.
 */
export function GridOverlay() {
  const cellRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cell = cellRef.current;
      const fill = fillRef.current;
      const label = labelRef.current;
      const cursor = cursorRef.current;
      if (!cell || !fill || !label || !cursor) return;
      const { grid, smoothed, interaction } = labStore.latest;
      if (!grid || !smoothed.tracking || !grid.rows) {
        cell.style.display = "none";
        cursor.style.display = "none";
        return;
      }
      const armed = interaction.state === "ARMED" || interaction.state === "CONFIRMING";
      const color = armed ? "var(--lab-armed)" : "var(--lab-accent)";
      cursor.style.display = "block";
      cursor.style.left = `${grid.cursorX * 100}%`;
      cursor.style.top = `${grid.cursorY * 100}%`;
      cursor.style.background = color;
      if (!grid.cell || !grid.cellRect) {
        cell.style.display = "none";
        return;
      }
      const r = grid.cellRect;
      cell.style.display = "block";
      cell.style.left = `${r.x * 100}%`;
      cell.style.top = `${r.y * 100}%`;
      cell.style.width = `${r.w * 100}%`;
      cell.style.height = `${r.h * 100}%`;
      cell.style.borderColor = color;
      cell.style.borderStyle = grid.settled ? "solid" : "dashed";
      cell.style.opacity = grid.settled ? "1" : "0.6";
      fill.style.background = color;
      fill.style.opacity = grid.settled ? "0.12" : `${0.04 + grid.settleProgress * 0.08}`;
      label.style.color = color;
      label.textContent = grid.settled ? (grid.targetId ? "STOP" : "EMPTY") : grid.settleProgress > 0 ? "…" : "GLIDE";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div ref={cellRef} className="pointer-events-none absolute z-[6] rounded border-2 transition-[left,top] duration-75" style={{ display: "none" }}>
        <div ref={fillRef} className="absolute inset-0" />
        <div ref={labelRef} className="absolute left-1 top-0.5 font-mono text-[8px] tracking-widest" />
      </div>
      <div ref={cursorRef} className="pointer-events-none absolute z-[7] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80" style={{ display: "none" }} />
    </>
  );
}
