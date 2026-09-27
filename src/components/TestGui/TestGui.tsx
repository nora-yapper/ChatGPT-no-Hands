"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, Btn, fmt } from "@/components/ui";
import { labStore, useLab } from "@/store/labStore";
import { useSettings } from "@/store/settingsStore";
import { pipeline } from "@/pipeline/Pipeline";
import type { ActionEvent, FocusTarget } from "@/types/interaction";
import { FocusableTarget } from "./FocusableTarget";
import { GridArea } from "./GridArea";

const CARDS = ["PROJECT", "MARKET", "PRODUCT", "TEAM"];
const BUTTONS = ["SELECT", "OPEN", "DELETE", "NEXT", "BACK"];
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

interface Stats {
  actions: number;
  chars: number;
  firstActionAt: number | null;
  startedAt: number | null;
  falsePositives: number;
  lastFlash: Record<string, number>;
}

/** Pointer crosshair drawn from the high-frequency store (rAF), independent of React re-renders. */
export function PointerCursor() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = ref.current;
      if (!el) return;
      const { smoothed, interaction } = labStore.latest;
      el.style.display = smoothed.tracking ? "block" : "none";
      el.style.left = `${smoothed.pointerX * 100}%`;
      el.style.top = `${smoothed.pointerY * 100}%`;
      el.style.borderColor = interaction.state === "ARMED" ? "var(--lab-armed)" : "var(--lab-accent)";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className="pointer-events-none absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lab-accent bg-lab-accent/10" style={{ display: "none" }} />;
}

export function TestGui() {
  const lab = useLab();
  const settings = useSettings();
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<Stats>({ actions: 0, chars: 0, firstActionAt: null, startedAt: null, falsePositives: 0, lastFlash: {} });
  const [log, setLog] = useState<string[]>([]);

  // keep the focus manager informed of the area rect (pointer 0..1 maps onto it)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      pipeline.focus.setAreaRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const handleAction = useCallback((a: ActionEvent) => {
    const id = a.target?.id ?? "global";
    let note = `${a.action}`;
    const cur = selectedRef.current;
    switch (a.action) {
      case "SELECT_CARD":
        setSelected(a.target?.payload?.card as string);
        note = `selected ${a.target?.label}`;
        break;
      case "SELECT":
        note = cur ? `SELECT (already ${cur})` : "SELECT (nothing focused before)";
        break;
      case "OPEN":
        setOpened(cur);
        note = cur ? `opened ${cur}` : "OPEN with no selection";
        break;
      case "DELETE":
        if (cur) {
          setDeleted((d) => [...d, cur]);
          setSelected(null);
          note = `deleted ${cur}`;
        } else note = "DELETE with no selection";
        break;
      case "NEXT":
        setPage((p) => p + 1);
        break;
      case "BACK":
        setPage((p) => Math.max(0, p - 1));
        setDeleted([]);
        setOpened(null);
        note = "BACK (restored deleted cards)";
        break;
      case "TYPE":
        setText((t) => t + (a.target?.payload?.char as string));
        note = `typed "${a.target?.payload?.char}"`;
        break;
      case "SPACE":
        setText((t) => t + " ");
        break;
      case "BACKSPACE":
        setText((t) => t.slice(0, -1));
        break;
      case "OPEN_MENU":
        setMenuOpen((m) => !m);
        break;
    }
    setStats((s) => ({
      ...s,
      actions: s.actions + 1,
      chars: s.chars + (a.action === "TYPE" || a.action === "SPACE" ? 1 : 0),
      firstActionAt: s.firstActionAt ?? a.timestamp,
      lastFlash: { ...s.lastFlash, [id]: a.timestamp },
    }));
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${note}  ← ${a.reason.triggerEvent}`, ...l].slice(0, 6));
  }, []);

  useEffect(() => pipeline.dispatcher.register(handleAction), [handleAction]);
  useEffect(
    () =>
      pipeline.bus.subscribe((e) => {
        if (e.type === "FALSE_POSITIVE") setStats((s) => ({ ...s, falsePositives: s.falsePositives + 1 }));
      }),
    [],
  );

  const startedAt = stats.startedAt ?? lab.sessionStart;
  const elapsedMin = Math.max(1 / 60, (lab.now - startedAt) / 60000);
  const cardTargets = useMemo<FocusTarget[]>(() => CARDS.map((c) => ({ id: `card-${c.toLowerCase()}`, kind: "card", label: c, action: "SELECT_CARD", payload: { card: c } })), []);
  const buttonTargets = useMemo<FocusTarget[]>(() => BUTTONS.map((b) => ({ id: `btn-${b.toLowerCase()}`, kind: "button", label: b, action: b })), []);

  return (
    <Panel
      title="INTERACTION TEST AREA"
      right={
        <>
          <span className="font-mono text-[10px] text-lab-dim">
            actions <b className="text-lab-fg">{stats.actions}</b> · {fmt(stats.actions / elapsedMin, 1)}/min · chars <b className="text-lab-fg">{stats.chars}</b> · {fmt(stats.chars / elapsedMin, 1)}/min · first action{" "}
            {stats.firstActionAt ? `${((stats.firstActionAt - startedAt) / 1000).toFixed(1)} s` : "—"} · false+ <b className="text-lab-bad">{stats.falsePositives}</b>
          </span>
          <Btn onClick={() => pipeline.markFalsePositive()} title="Tag the last executed action as unintended (shortcut: F)" variant="danger">MARK FALSE + (F)</Btn>
          <Btn onClick={() => { setStats({ actions: 0, chars: 0, firstActionAt: null, startedAt: performance.now(), falsePositives: 0, lastFlash: {} }); setText(""); setSelected(null); setOpened(null); setDeleted([]); setPage(0); setLog([]); }}>RESET</Btn>
        </>
      }
    >
      <div ref={areaRef} className="relative rounded border border-dashed border-lab-border/80 p-2">
        {settings.focusMode === "grid" ? (
          <GridArea cardTargets={cardTargets} buttonTargets={buttonTargets} keyRows={KEY_ROWS} selected={selected} opened={opened} deleted={deleted} page={page} text={text} menuOpen={menuOpen} log={log} lastFlash={stats.lastFlash} />
        ) : (
        <>
        {settings.focusMode === "pointer" && <PointerCursor />}
        {menuOpen && <div className="absolute right-3 top-3 z-20 rounded border border-lab-confirm bg-lab-panel px-3 py-2 font-mono text-[11px] text-lab-confirm">MENU (opened by OPEN_MENU)</div>}

        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <div>
            <div className="mb-1 font-mono text-[10px] tracking-[0.18em] text-lab-dim">NAVIGATION CARDS · page {page}</div>
            <div className="grid grid-cols-4 gap-2">
              {cardTargets.map((t) => {
                const name = t.payload!.card as string;
                const isDeleted = deleted.includes(name);
                return (
                  <FocusableTarget key={t.id} target={t} flashKey={stats.lastFlash[t.id]} className={`h-16 ${isDeleted ? "opacity-30" : ""}`}>
                    <div className="flex h-full flex-col items-center justify-center gap-1">
                      <span className="font-mono text-sm font-semibold tracking-widest">{name}</span>
                      <span className="font-mono text-[9px] text-lab-dim">
                        {isDeleted ? "DELETED" : selected === name ? (opened === name ? "SELECTED · OPEN" : "SELECTED") : "card"}
                      </span>
                    </div>
                  </FocusableTarget>
                );
              })}
            </div>

            <div className="mb-1 mt-2 font-mono text-[10px] tracking-[0.18em] text-lab-dim">ACTION BUTTONS</div>
            <div className="grid grid-cols-5 gap-2">
              {buttonTargets.map((t) => (
                <FocusableTarget key={t.id} target={t} flashKey={stats.lastFlash[t.id]} className={`h-11 ${t.label === "DELETE" ? "border-lab-bad/40" : ""}`}>
                  <div className={`flex h-full items-center justify-center font-mono text-xs font-semibold tracking-widest ${t.label === "DELETE" ? "text-lab-bad" : ""}`}>{t.label}</div>
                </FocusableTarget>
              ))}
            </div>

            <div className="mt-2 rounded border border-lab-border bg-black/30 px-2 py-1 font-mono text-[10px] text-lab-dim">
              <span className="mr-2 tracking-[0.18em]">GUI RESULT LOG</span>
              {log.length === 0 ? <span>No GUI actions yet.</span> : log.slice(0, 2).map((l, i) => <div key={i} className={`truncate ${i === 0 ? "text-lab-fg" : ""}`}>{l}</div>)}
            </div>
          </div>

          <div>
            <div className="mb-1 font-mono text-[10px] tracking-[0.18em] text-lab-dim">TEXT INPUT EXPERIMENT</div>
            <div className="mb-1.5 min-h-7 rounded border border-lab-border bg-black/40 px-2 py-1 font-mono text-sm">
              {text}
              <span className="animate-pulse text-lab-accent">▍</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              {KEY_ROWS.map((row) => (
                <div key={row} className="flex gap-1.5">
                  {row.split("").map((ch) => {
                    const t: FocusTarget = { id: `key-${ch}`, kind: "key", label: ch, action: "TYPE", payload: { char: ch } };
                    return (
                      <FocusableTarget key={ch} target={t} flashKey={stats.lastFlash[t.id]} className="h-9 w-10">
                        <div className="flex h-full items-center justify-center font-mono text-xs font-semibold">{ch}</div>
                      </FocusableTarget>
                    );
                  })}
                </div>
              ))}
              <div className="flex gap-1.5">
                <FocusableTarget target={{ id: "key-backspace", kind: "key", label: "⌫", action: "BACKSPACE" }} flashKey={stats.lastFlash["key-backspace"]} className="h-9 w-20">
                  <div className="flex h-full items-center justify-center font-mono text-xs">⌫ BACK</div>
                </FocusableTarget>
                <FocusableTarget target={{ id: "key-space", kind: "key", label: "SPACE", action: "SPACE" }} flashKey={stats.lastFlash["key-space"]} className="h-9 w-56">
                  <div className="flex h-full items-center justify-center font-mono text-xs">SPACE</div>
                </FocusableTarget>
              </div>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </Panel>
  );
}
