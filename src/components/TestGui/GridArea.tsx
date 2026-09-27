"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { pipeline } from "@/pipeline/Pipeline";
import type { FocusTarget } from "@/types/interaction";
import type { GridLayout } from "@/interaction/gridNavigator";
import { FocusableTarget } from "./FocusableTarget";
import { GridOverlay } from "./GridOverlay";

export interface GridAreaProps {
  cardTargets: FocusTarget[];
  buttonTargets: FocusTarget[];
  keyRows: string[];
  selected: string | null;
  opened: string | null;
  deleted: string[];
  page: number;
  text: string;
  menuOpen: boolean;
  log: string[];
  lastFlash: Record<string, number>;
}

/**
 * Grid glide layout of the interaction test area: every card, button and key occupies exactly one
 * field of a ragged grid (rows span the full width, so a row of 4 cards has 4 wide fields and a row
 * of 10 keys has 10 narrow ones). The layout is declared to the pipeline so the navigator's fields
 * and the rendered fields are the same thing by construction.
 */
export function GridArea(p: GridAreaProps) {
  const backspace: FocusTarget = { id: "key-backspace", kind: "key", label: "⌫", action: "BACKSPACE" };
  const space: FocusTarget = { id: "key-space", kind: "key", label: "SPACE", action: "SPACE" };
  const keyTargets = useMemo<FocusTarget[][]>(() => p.keyRows.map((row) => row.split("").map((ch) => ({ id: `key-${ch}`, kind: "key", label: ch, action: "TYPE", payload: { char: ch } }))), [p.keyRows]);

  /**
   * Uniform grid: every row has LEFT_COLS fields for cards/buttons, GAP_COLS empty fields, then RIGHT_COLS
   * fields for the keyboard. Equal row lengths give equal cell sizes, so the overlay's cell math and the
   * rendered fields line up exactly. null = empty field.
   */
  const rows: Array<Array<FocusTarget | null>> = useMemo(() => {
    const LEFT_COLS = 4;
    const GAP_COLS = 1;
    const RIGHT_COLS = Math.max(...keyTargets.map((r) => r.length), 2);
    const pad = (cells: Array<FocusTarget | null>, n: number) => [...cells, ...Array<null>(Math.max(0, n - cells.length)).fill(null)].slice(0, n);
    const left: Array<Array<FocusTarget | null>> = [p.cardTargets, p.buttonTargets.slice(0, LEFT_COLS), p.buttonTargets.slice(LEFT_COLS), []];
    const right: Array<Array<FocusTarget | null>> = [...keyTargets, [backspace, space]];
    const n = Math.max(left.length, right.length);
    return Array.from({ length: n }, (_, i) => [...pad(left[i] ?? [], LEFT_COLS), ...Array<null>(GAP_COLS).fill(null), ...pad(right[i] ?? [], RIGHT_COLS)]);
  }, [p.cardTargets, p.buttonTargets, keyTargets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const layout: GridLayout = { rows: rows.map((r) => r.map((t) => t?.id ?? null)) };
    pipeline.setGridLayout(layout);
    return () => pipeline.setGridLayout({ rows: [] });
  }, [rows]);

  const cell = (t: FocusTarget, children: ReactNode, extra = "") => (
    <div key={t.id} className="min-w-0 p-0.5">
      <FocusableTarget target={t} flashKey={p.lastFlash[t.id]} className={`h-full ${extra}`}>
        {children}
      </FocusableTarget>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <div className="min-h-7 rounded border border-lab-border bg-black/40 px-2 py-1 font-mono text-sm">
          <span className="mr-2 font-mono text-[9px] tracking-[0.18em] text-lab-dim">TEXT</span>
          {p.text}
          <span className="animate-pulse text-lab-accent">▍</span>
        </div>
        <div className="rounded border border-lab-border bg-black/30 px-2 py-1 font-mono text-[10px] text-lab-dim">
          <span className="tracking-[0.18em]">GUI RESULT LOG · page {p.page}</span>
          {p.log.length === 0 ? <div>No GUI actions yet.</div> : p.log.slice(0, 2).map((l, i) => <div key={i} className={`truncate ${i === 0 ? "text-lab-fg" : ""}`}>{l}</div>)}
        </div>
      </div>

      <div className="relative">
        <GridOverlay />
        {p.menuOpen && <div className="absolute right-3 top-3 z-20 rounded border border-lab-confirm bg-lab-panel px-3 py-2 font-mono text-[11px] text-lab-confirm">MENU (opened by OPEN_MENU)</div>}
        <div className="grid" style={{ gridTemplateRows: `repeat(${rows.length}, 38px)` }}>
          {rows.map((row, ri) => (
            <div key={ri} className="grid" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
              {row.map((t, ci) => {
                if (!t) return <div key={`empty-${ri}-${ci}`} className="min-w-0 p-0.5"><div className="h-full rounded border border-dashed border-lab-border/30" /></div>;
                if (t.kind === "card") {
                  const name = t.payload!.card as string;
                  const isDeleted = p.deleted.includes(name);
                  return cell(
                    t,
                    <div className="flex h-full items-center justify-center gap-1.5">
                      <span className="font-mono text-xs font-semibold tracking-widest">{name}</span>
                      <span className="font-mono text-[8px] text-lab-dim">{isDeleted ? "DEL" : p.selected === name ? (p.opened === name ? "SEL·OPEN" : "SEL") : ""}</span>
                    </div>,
                    isDeleted ? "opacity-30" : "",
                  );
                }
                if (t.kind === "button") {
                  return cell(t, <div className={`flex h-full items-center justify-center font-mono text-[11px] font-semibold tracking-widest ${t.label === "DELETE" ? "text-lab-bad" : ""}`}>{t.label}</div>, t.label === "DELETE" ? "border-lab-bad/40" : "");
                }
                return cell(t, <div className="flex h-full items-center justify-center font-mono text-xs font-semibold">{t.action === "BACKSPACE" ? "⌫" : t.label}</div>);
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
