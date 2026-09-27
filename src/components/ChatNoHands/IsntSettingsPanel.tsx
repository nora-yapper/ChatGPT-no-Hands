"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Minus, Move, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { pipeline } from "@/pipeline/Pipeline";
import { settingsStore, useSettings } from "@/store/settingsStore";
import { useLab } from "@/store/labStore";
import type { ActionEvent, FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ACTIONS, GESTURES, LEVELS, PRESETS, applyPreset, assign, gestureLabel, gestureOf, resetMovement, slotOf, stepLevel, type GestureSlot, type IsntGesture, type IsntSettings, type LevelId } from "@/isnt/isntSettings";
import { ChatFocusable } from "./ChatFocusable";

/*
 * ISNT's settings, usable entirely by head: every control is a big ChatFocusable (same focus → arm → confirm as
 * everywhere else), steppers instead of sliders, option tiles instead of dropdowns, two tabs so nothing
 * scrolls. The strip at the bottom explains whatever is being pointed at (head focus, or mouse hover).
 * Actions are IS_*, handled here for both a confirmed gesture (dispatcher) and a click — the Recents pattern.
 */

type Tab = "gestures" | "movement";

const t = (id: string, label: string, action: string, payload?: Record<string, unknown>): FocusTarget => ({ id: `is-${id}`, kind: "button", label, action, payload });

/** plain-language explanations, keyed by target id, for the strip */
function explanations(s: IsntSettings, slot: GestureSlot | null): Record<string, string> {
  const e: Record<string, string> = {
    "is-tab-gestures": "Choose which face or head gesture confirms, and which gestures work as shortcuts.",
    "is-tab-movement": "Tune how the pointer, scrolling and gestures respond to your head and face.",
    "is-flip-x": "Reverse left and right if the pointer moves the wrong way when you turn your head.",
    "is-flip-y": "Reverse up and down if the pointer moves the wrong way when you tilt your head.",
    "is-reset": "Put every movement setting back to its default. Your gestures stay as they are.",
    "is-pick-none": "Remove this shortcut's gesture.",
    "is-close": "Close without changing anything.",
  };
  for (const a of ACTIONS) e[`is-slot-${a.id}`] = a.explain;
  for (const p of PRESETS) e[`is-preset-${p.id}`] = `Preset: ${p.explain} Long blink goes to Account; head to left / right shoulder is Back / Send.`;
  for (const l of LEVELS) {
    e[`is-step-${l.id}-down`] = `${l.label}: ${l.explain}`;
    e[`is-step-${l.id}-up`] = `${l.label}: ${l.explain}`;
  }
  for (const g of GESTURES) {
    const blocked = slot && blockedReason(s, slot, g.id);
    e[`is-pick-${g.id}`] = blocked ? `${g.label}: ${blocked}` : `${g.label}: ${g.explain}`;
  }
  return e;
}

/** why a gesture can't be chosen for this slot, if it can't */
function blockedReason(s: IsntSettings, slot: GestureSlot, g: IsntGesture): string | null {
  if (slot === "CONFIRM" && !GESTURES.find((x) => x.id === g)?.face) return "Can't confirm — a head movement would move the pointer off the button.";
  if (slot !== "CONFIRM" && g === s.confirm) return "Used to confirm, so it can't also be a shortcut.";
  return null;
}

export function IsntSettingsPanel({ enabled, lastFlash, onActivate, style }: { enabled: boolean; lastFlash: Record<string, number>; onActivate: (t: FocusTarget) => void; style?: React.CSSProperties }) {
  const isnt = useSettings().isnt;
  const focusId = useLab().focusId;
  const [tab, setTab] = useState<Tab>("gestures");
  /** the action whose gesture is being chosen (chooser open) */
  const [slot, setSlot] = useState<GestureSlot | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  /** a one-off note after a change (e.g. a gesture moved from another action) */
  const [notice, setNotice] = useState<string | null>(null);

  const update = (next: IsntSettings) => settingsStore.set({ isnt: next });

  const act = useCallback((target: FocusTarget | null, action: string) => {
    const p = target?.payload ?? {};
    const s = settingsStore.get().isnt;
    switch (action) {
      case "IS_TAB": setTab(p.tab as Tab); setSlot(null); setNotice(null); break;
      case "IS_SLOT": setSlot(p.slot as GestureSlot); setNotice(null); break;
      case "IS_CLOSE": setSlot(null); break;
      case "IS_PICK": {
        const sl = p.slot as GestureSlot;
        const r = assign(s, sl, (p.gesture as IsntGesture | null) ?? null, Date.now());
        if (!r.ok) break;
        update(r.settings);
        const label = (id: GestureSlot) => ACTIONS.find((a) => a.id === id)!.label;
        setNotice(
          sl === "CONFIRM" && r.settings.confirmTrial
            ? `Confirm something with “${gestureLabel(r.settings.confirm)}” within 20 s to keep it — otherwise it switches back automatically.`
            : r.moved ? `“${gestureLabel(p.gesture as IsntGesture)}” moved here from “${label(r.moved)}”, which now has no gesture.` : null,
        );
        setSlot(null);
        break;
      }
      case "IS_PRESET": {
        const next = applyPreset(s, p.id as string, Date.now());
        update(next);
        setNotice(next.confirmTrial && next.confirm !== s.confirm ? `Confirm something with “${gestureLabel(next.confirm)}” within 20 s to keep it — otherwise it switches back automatically.` : "Preset applied.");
        break;
      }
      case "IS_STEP": update(stepLevel(s, p.id as LevelId, p.delta as 1 | -1)); break;
      case "IS_FLIP": update(p.axis === "x" ? { ...s, flipX: !s.flipX } : { ...s, flipY: !s.flipY }); break;
      case "IS_RESET": update(resetMovement(s)); setNotice("Movement settings are back to their defaults."); break;
    }
  }, []);

  useEffect(() => pipeline.dispatcher.register((a: ActionEvent) => { if (a.action.startsWith("IS_")) act(a.target, a.action); }), [act]);
  const activate = useCallback((target: FocusTarget) => { onActivate(target); act(target, target.action); }, [onActivate, act]);
  // the screen's field measurement is keyed to New Chat state: re-measure when our targets change (as Recents does)
  useEffect(() => {
    const fire = () => window.dispatchEvent(new Event("resize"));
    fire();
    const id = setTimeout(fire, 250);
    return () => clearTimeout(id);
  }, [tab, slot]);

  // a notice (e.g. "moved from …") shows for a while, then the strip goes back to explaining what's pointed at
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(id);
  }, [notice]);

  const ex = explanations(isnt, slot);
  const pointed = (hover && ex[hover]) || (focusId && ex[focusId]) || null;
  /** `covered`: sits under the open chooser — rendered, but not a head target (like Recents under its menu) */
  const tile = (target: FocusTarget, content: React.ReactNode, opts: { active?: boolean; disabled?: boolean; covered?: boolean; className?: string; variant?: "secondary" | "ghost" } = {}) => (
    <ChatFocusable key={target.id} target={target} enabled={enabled && !opts.disabled && !opts.covered} flashKey={lastFlash[target.id]} radius="rounded-2xl" onActivate={opts.disabled ? undefined : activate}>
      <Button
        variant={opts.variant ?? "secondary"}
        disabled={opts.disabled}
        onMouseEnter={() => setHover(target.id)}
        onMouseLeave={() => setHover((h) => (h === target.id ? null : h))}
        className={cn("h-full w-full whitespace-normal rounded-2xl px-4 text-[15px] font-normal leading-snug disabled:opacity-35", opts.active && "ring-2 ring-foreground/60", opts.className)}
      >
        {content}
      </Button>
    </ChatFocusable>
  );

  // on the page background, not bg-card: in dark mode the card surface is the same colour as the secondary
  // tiles (#2f2f2f), which would make every tile invisible
  return (
    <section aria-label="ISNT settings" className="relative flex min-h-0 flex-col gap-3 rounded-[24px] border border-border bg-background p-4 animate-in fade-in duration-300" style={style}>
      <div className="grid h-12 shrink-0 grid-cols-2 gap-3">
        {tile(t("tab-gestures", "Gestures", "IS_TAB", { tab: "gestures" }), <span className="flex items-center gap-2"><Sparkles className="size-5" /> Gestures</span>, { active: tab === "gestures" })}
        {tile(t("tab-movement", "Movement", "IS_TAB", { tab: "movement" }), <span className="flex items-center gap-2"><Move className="size-5" /> Movement</span>, { active: tab === "movement" })}
      </div>

      <div className="relative min-h-0 flex-1">
        {tab === "gestures" ? (
          <div className="grid h-full gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(5, minmax(0, 1fr))" }}>
            {ACTIONS.map((a) => {
              const g = gestureOf(isnt, a.id);
              return tile(
                t(`slot-${a.id}`, `Gesture for ${a.label}`, "IS_SLOT", { slot: a.id }),
                <span className="flex w-full flex-col items-start gap-0.5 text-left">
                  <span className="text-xs text-muted-foreground">{a.label}</span>
                  <span className={cn("text-[16px] font-medium", !g && "text-muted-foreground")}>{g ? gestureLabel(g) : "No gesture"}</span>
                </span>,
                { active: slot === a.id, covered: !!slot },
              );
            })}
            {PRESETS.map((p) => tile(t(`preset-${p.id}`, `Preset: ${p.label}`, "IS_PRESET", { id: p.id }), <span className="flex items-center gap-2"><Check className="size-4" /> Preset: {p.label}</span>, { variant: "ghost", covered: !!slot, className: "border border-dashed border-border" }))}
          </div>
        ) : (
          <div className="grid h-full gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(5, minmax(0, 1fr))" }}>
            {LEVELS.map((l) => {
              const i = isnt.levels[l.id];
              return (
                <div key={l.id} className="flex min-h-0 items-center gap-2 rounded-2xl border border-border py-1.5 pl-4 pr-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{l.group}</div>
                    <div className="truncate text-[15px]">{l.label}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold tabular-nums">{l.display[i]}</span>
                      <span className="flex gap-0.5" aria-hidden>{l.display.map((_, k) => <span key={k} className={cn("h-1.5 w-2.5 rounded-full", k <= i ? "bg-foreground/70" : "bg-foreground/15")} />)}</span>
                    </div>
                  </div>
                  <div className="grid h-full w-[7.5rem] shrink-0 grid-cols-2 gap-1.5">
                    {tile(t(`step-${l.id}-down`, `${l.label}: less`, "IS_STEP", { id: l.id, delta: -1 }), <Minus className="size-5" />, { disabled: i === 0, className: "px-0" })}
                    {tile(t(`step-${l.id}-up`, `${l.label}: more`, "IS_STEP", { id: l.id, delta: 1 }), <Plus className="size-5" />, { disabled: i === l.display.length - 1, className: "px-0" })}
                  </div>
                </div>
              );
            })}
            <div className="grid min-h-0 grid-cols-2 gap-2">
              {tile(t("flip-x", "Flip left / right", "IS_FLIP", { axis: "x" }), <span className="flex flex-col"><span className="text-xs text-muted-foreground">Flip left/right</span>{isnt.flipX ? "On" : "Off"}</span>, { active: isnt.flipX, className: "px-2" })}
              {tile(t("flip-y", "Flip up / down", "IS_FLIP", { axis: "y" }), <span className="flex flex-col"><span className="text-xs text-muted-foreground">Flip up/down</span>{isnt.flipY ? "On" : "Off"}</span>, { active: isnt.flipY, className: "px-2" })}
            </div>
            {tile(t("reset", "Reset movement settings", "IS_RESET"), <span className="flex items-center gap-2"><RotateCcw className="size-5" /> Reset to defaults</span>, { variant: "ghost", className: "border border-dashed border-border" })}
          </div>
        )}

        {slot && (
          <div className="absolute inset-0 z-[5] flex flex-col gap-2 rounded-2xl border border-border bg-background p-3 shadow-[0_8px_32px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-200" role="dialog" aria-label={`Gesture for ${ACTIONS.find((a) => a.id === slot)!.label}`}>
            <div className="px-1 text-xs font-medium text-muted-foreground">Gesture for “{ACTIONS.find((a) => a.id === slot)!.label}”</div>
            <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}>
              {GESTURES.map((g) => {
                const current = gestureOf(isnt, slot) === g.id;
                const blocked = blockedReason(isnt, slot, g.id);
                const usedBy = slotOf(isnt, g.id);
                const note = current ? "Current" : blocked ? (slot === "CONFIRM" ? "Can't confirm" : "Used to confirm") : usedBy ? `Now: ${ACTIONS.find((a) => a.id === usedBy)!.label}` : null;
                return tile(
                  t(`pick-${g.id}`, g.label, "IS_PICK", { slot, gesture: g.id }),
                  <span className="flex flex-col items-center gap-0.5"><span>{g.label}</span>{note && <span className="text-[11px] text-muted-foreground">{note}</span>}</span>,
                  { active: current, disabled: !!blocked || current, className: "px-2" },
                );
              })}
              {slot !== "CONFIRM" && tile(t("pick-none", "No gesture", "IS_PICK", { slot, gesture: null }), "No gesture", { variant: "ghost", disabled: !gestureOf(isnt, slot), className: "border border-dashed border-border" })}
              {tile(t("close", "Close", "IS_CLOSE"), <span className="flex items-center gap-1.5 text-muted-foreground"><X className="size-5" /> Close</span>, { variant: "ghost" })}
            </div>
          </div>
        )}
      </div>

      {/* what the thing being pointed at does, in plain words */}
      <p className="min-h-[2.75rem] shrink-0 rounded-xl bg-muted/50 px-4 py-2 text-[13px] leading-snug text-muted-foreground" aria-live="polite">
        {notice ?? pointed ?? "Point at any setting to see what it does. Settings apply immediately."}
      </p>
    </section>
  );
}
