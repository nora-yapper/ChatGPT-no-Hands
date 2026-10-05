"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Cpu, Minus, Move, MoreHorizontal, Palette, Plus, RotateCcw, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { pipeline } from "@/pipeline/Pipeline";
import { settingsStore, useSettings } from "@/store/settingsStore";
import { labStore, useLab } from "@/store/labStore";
import { HOLD_VISIBLE_MS } from "@/interaction/InteractionStateMachine";
import type { ActionEvent, FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ACTIONS, DEFAULT_ISNT, FLIP_DOCS, GESTURES, LEVELS, PRESETS, applyPreset, assign, gestureLabel, gestureOf, resetMovement, slotOf, stepLevel, type GestureSlot, type IsntGesture, type IsntSettings, type LevelId } from "@/isnt/isntSettings";
import { ChatFocusable } from "./ChatFocusable";
import { Technicalities } from "./Technicalities";
import { TilePanel } from "./TilePanel";
import { useHeadScrollTarget } from "./useHeadScroll";

/*
 * ISNT's settings, usable entirely by head: every control is a big ChatFocusable (same focus → arm → confirm as
 * everywhere else), steppers instead of sliders, option tiles instead of dropdowns, two tabs so nothing
 * scrolls. The strip at the bottom explains whatever is being pointed at (head focus, or mouse hover).
 * Actions are IS_*, handled here for both a confirmed gesture (dispatcher) and a click — the Recents pattern.
 */

type Tab = "gestures" | "movement";

/* ── colour: orientation, never louder than the interaction feedback ──
 * Related controls share a card; each tab uses one hue at four lightness / saturation steps — the profile blue
 * for Movement, the projects card's purple for Gestures (`--blue-N` / `--purple-N` and their `-fill-N`, both
 * themes). A tile's dwell fill is its card's deeper shade, so the strongest colour on screen is still an
 * arming fill, and the focus / armed rings, confirm flash and cooldown bar (foreground-coloured) stay on top. */
/** one shade of the profile blue per Movement group (`--blue-N`, lightest to deepest) */
const GROUP_TINT: Record<string, number> = { "Pointer movement": 1, "Head range": 0, "Head scroll": 2, Gestures: 3 };
/** the Movement tab's group cards, in grid order (column by column) */
const MOVEMENT_GROUPS = ["Pointer movement", "Head range", "Head scroll", "Gestures"] as const;
/** Gestures tab: actions that belong together share a purple card (`--purple-N`, the projects card's hue),
 * in grid order (column by column) */
const ACTION_GROUPS: Array<{ name: string; slots: GestureSlot[]; shade: number }> = [
  { name: "Confirm", slots: ["CONFIRM"], shade: 3 },
  { name: "Writing", slots: ["BACK", "SEND", "KEYBOARD"], shade: 2 },
  { name: "Getting around", slots: ["ACCOUNT", "NEW_CHAT"], shade: 1 },
  { name: "On / off", slots: ["SCROLL_TOGGLE", "INCOGNITO"], shade: 0 },
];
/** the gesture chooser: one purple card per kind of gesture — a mirrored pair is the same movement, two directions */
const GESTURE_FAMILIES: Array<{ name: string; ids: IsntGesture[]; shade: number }> = [
  { name: "Face gestures", ids: ["MOUTH_HOLD", "BROW_RAISE_BOTH", "LONG_BLINK"], shade: 3 },
  { name: "Turning", ids: ["TURN_LEFT", "TURN_RIGHT"], shade: 2 },
  { name: "Tilting", ids: ["TILT_UP", "TILT_DOWN"], shade: 1 },
  { name: "Head to a shoulder", ids: ["ROLL_LEFT", "ROLL_RIGHT"], shade: 0 },
];
/** a tile's surface and dwell fill: a blue tile on a white row (Movement), or a white tile on a purple card (Gestures) */
type Shade = { tint: string; fill: string };
const blue = (i: number): Shade => ({ tint: `var(--blue-${i})`, fill: `var(--blue-fill-${i})` });
const onPurple = (i: number): Shade => ({ tint: "var(--background)", fill: `var(--purple-fill-${i})` });

/** a gesture change waiting for the user to confirm it — nothing changes until they do */
type Pending = { kind: "pick"; slot: GestureSlot; gesture: IsntGesture | null } | { kind: "preset"; id: string };

type MoreView = "menu" | "legend" | "tech" | "advanced";
const MORE_PAGES: Record<Exclude<MoreView, "menu">, { title: string; icon: React.ReactNode }> = {
  legend: { title: "Colour legend", icon: <Palette /> },
  tech: { title: "Technicalities", icon: <Cpu /> },
  advanced: { title: "About controls", icon: <SlidersHorizontal /> },
};

/**
 * What the colours on the settings screen mean — read-only, drawn from the same maps the screen uses. Colours
 * mark *groups*, not individual items: everything on one card belongs together.
 */
function ColorLegend() {
  const swatch = (bg: string, key?: string) => <span key={key} aria-hidden className="mt-px size-4 shrink-0 rounded-[5px] ring-1 ring-inset ring-foreground/10" style={{ background: bg }} />;
  const row = (bg: string, name: string) => (
    <li key={name} className="flex items-start gap-2">{swatch(bg)}<span className="min-w-0 font-medium">{name}</span></li>
  );
  const heading = (text: string) => <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{text}</h3>;
  const note = (text: string) => <p className="text-muted-foreground">{text}</p>;
  return (
    <div className="grid h-full grid-cols-2 gap-x-6 overflow-hidden px-2 leading-snug" style={{ fontSize: "clamp(10.5px, 1.6vh, 12.5px)" }}>
      <section className="flex flex-col gap-2">
        {heading("Movement tab")}
        {note("Settings that work together share a shade of blue.")}
        <ul className="flex flex-col gap-[clamp(2px,0.7vh,6px)]">
          {Object.entries(GROUP_TINT).map(([group, i]) => row(`var(--blue-${i})`, group))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        {heading("Gestures tab")}
        {note("Shortcuts that belong together share a shade of purple.")}
        <ul className="flex flex-col gap-[clamp(2px,0.7vh,6px)]">
          {ACTION_GROUPS.map((g) => row(`var(--purple-${g.shade})`, g.name))}
        </ul>
        {heading("Choosing a gesture")}
        <ul className="flex flex-col gap-[clamp(2px,0.7vh,6px)]">
          {GESTURE_FAMILIES.map((f) => row(`var(--purple-${f.shade})`, f.name))}
        </ul>
      </section>
    </div>
  );
}

/**
 * More › About controls: what each Movement control changes underneath — the original parameters, how they're
 * combined, the default and the safe range. Read-only; the text lives next to the steps in `isntSettings.ts`.
 */
function AdvancedTable({ active }: { active: boolean }) {
  // on short screens where the table can't fit, head scroll (the app's own gesture) scrolls it
  const boxRef = useRef<HTMLDivElement | null>(null);
  useHeadScrollTarget({ scrollBy: (dy) => boxRef.current?.scrollBy({ top: dy, behavior: "instant" }) }, active);
  const rows = [...LEVELS.map((l) => ({ label: l.label, group: l.group as string, ...l.doc })), ...FLIP_DOCS];
  const groups = [...new Set(rows.map((r) => r.group))];
  const cell = "px-2.5 py-1";
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 px-1" style={{ fontSize: "clamp(10px, 1.3vh, 11.5px)" }}>
      <p className="text-muted-foreground">{"What each Movement setting adjusts behind the scenes: the tracking values it controls, how they change together, its default, and the safe range it stays within."}</p>
      <div ref={boxRef} className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
        <table className="w-full table-fixed border-collapse text-left leading-snug">
          <colgroup><col className="w-[13%]" /><col className="w-[20%]" /><col className="w-[37%]" /><col className="w-[14%]" /><col className="w-[16%]" /></colgroup>
          <thead className="sticky top-0 z-[1] bg-muted text-muted-foreground">
            <tr>{["Setting", "Original parameters it controls", "How they're combined", "Default", "Safe range"].map((h) => <th key={h} className={cn(cell, "font-medium")}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              // the group once, as a section row, instead of "(group)" after every setting
              <tr key={`group-${g}`} className="border-t border-border bg-muted/40"><td colSpan={5} className="px-2.5 py-0.5 text-[0.85em] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g}</td></tr>,
              ...rows.filter((r) => r.group === g).map((r) => (
                <tr key={r.label} className="border-t border-border align-top">
                  <td className={cn(cell, "font-medium")}>{r.label}</td>
                  <td className={cell}>{r.params}</td>
                  <td className={cn(cell, "text-muted-foreground")}>{r.combine}</td>
                  <td className={cell}>{r.defaults}</td>
                  <td className={cell}>{r.range}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/** what a pending gesture change will do, in words — the confirmation's body */
function ChangeSummary({ pending, isnt }: { pending: Pending; isnt: IsntSettings }) {
  let title: string, from: string | null = null, to: string, notes: string[] = [];
  if (pending.kind === "preset") {
    const p = PRESETS.find((x) => x.id === pending.id)!;
    title = "Apply this preset?";
    to = `Preset: ${p.label}`;
    notes = [p.explain, "It replaces all your current gesture choices."];
    if (p.confirm !== isnt.confirm) notes.push("You'll have 20 s to confirm something with the new gesture, or it switches back.");
  } else {
    const { slot, gesture } = pending;
    const moved = assign(isnt, slot, gesture, 0).moved;
    title = `Change the gesture for “${actionLabel(slot)}”?`;
    from = gestureOf(isnt, slot) ? gestureLabel(gestureOf(isnt, slot)) : "No gesture";
    to = gesture ? gestureLabel(gesture) : "No gesture";
    if (moved) notes.push(`“${actionLabel(moved)}” will then have no gesture.`);
    if (slot === "CONFIRM") notes.push("You'll have 20 s to confirm something with it, or it switches back.");
  }
  return (
    <div className="flex min-h-0 flex-col items-center justify-center gap-3 overflow-hidden px-4 text-center">
      <div className="text-[15px] font-medium">{title}</div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-[16px]">
        {from && <><span className="rounded-xl bg-muted px-3 py-1.5 text-muted-foreground">{from}</span><ArrowRight className="size-5 text-muted-foreground" aria-label="to" /></>}
        <span className="rounded-xl px-3 py-1.5 font-semibold" style={{ background: "var(--purple-1)" }}>{to}</span>
      </div>
      {notes.length > 0 && <div className="flex flex-col gap-0.5 text-[13px] text-muted-foreground">{notes.map((n) => <p key={n}>{n}</p>)}</div>}
    </div>
  );
}

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
    "is-apply": "Make this change.",
    "is-cancel": "Keep things as they are.",
    "is-more": "More: what the colours on this screen mean, technical details, and what each control changes underneath.",
    "is-more-legend": "Colour legend: what each colour on this screen stands for.",
    "is-more-tech": "Technicalities: how ISNT works, stage by stage, the research it's based on and the open-source tools it uses.",
    "is-more-advanced": "About controls: what each Movement setting changes underneath, with its default and safe range.",
    "is-more-back": "Back to the More menu.",
    "is-more-close": "Close this panel.",
    "is-adv-back": "Back to the More menu.",
    "is-adv-close": "Close About controls.",
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

const CANT_CONFIRM = "Can't confirm — a head movement would move the pointer off the button.";
const IS_CONFIRM = "Used to confirm, so it can't also be a shortcut.";
/** why a gesture can't be chosen for this slot, if it can't */
function blockedReason(s: IsntSettings, slot: GestureSlot, g: IsntGesture): string | null {
  if (slot === "CONFIRM" && !GESTURES.find((x) => x.id === g)?.face) return CANT_CONFIRM;
  if (slot !== "CONFIRM" && g === s.confirm) return IS_CONFIRM;
  return null;
}

/* one-off notices after a change (they take over the strip for a while) */
const actionLabel = (id: GestureSlot) => ACTIONS.find((a) => a.id === id)!.label;
const trialNotice = (g: IsntGesture) => `Confirm something with “${gestureLabel(g)}” within 20 s to keep it — otherwise it switches back automatically.`;
const movedNotice = (g: IsntGesture, from: GestureSlot) => `“${gestureLabel(g)}” moved here from “${actionLabel(from)}”, which now has no gesture.`;
const PRESET_NOTICE = "Preset applied.";
const RESET_NOTICE = "Movement settings are back to their defaults.";
const IDLE_TEXT = "Point at any setting to see what it does. Settings apply immediately.";

/**
 * Every text the strip can ever show — the strip stacks all of them invisibly in one grid cell, so its height is
 * the tallest one at the current width (measured by layout, not guessed) and never changes as focus moves.
 */
function allStripTexts(): string[] {
  const texts = new Set<string>([IDLE_TEXT, PRESET_NOTICE, RESET_NOTICE, ...Object.values(explanations(DEFAULT_ISNT, null))]);
  for (const g of GESTURES) {
    texts.add(`${g.label}: ${g.explain}`).add(`${g.label}: ${CANT_CONFIRM}`).add(`${g.label}: ${IS_CONFIRM}`).add(trialNotice(g.id));
    for (const a of ACTIONS) texts.add(movedNotice(g.id, a.id));
  }
  return [...texts];
}
const STRIP_TEXTS = allStripTexts();

/**
 * `advancedHost`: an element the Account screen places over its whole block — About controls is too wide for
 * this panel, so it's portalled there. `onCover` tells the Account screen while it covers the profile card too.
 */
export function IsntSettingsPanel({ enabled, lastFlash, onActivate, style, advancedHost, onCover }: { enabled: boolean; lastFlash: Record<string, number>; onActivate: (t: FocusTarget) => void; style?: React.CSSProperties; advancedHost?: HTMLElement | null; onCover?: (covered: boolean) => void }) {
  const isnt = useSettings().isnt;
  const focusId = useLab().focusId;
  const cooldownMs = useSettings().thresholds.cooldownMs;
  /** the setting card the head pointer (Grid Glide cursor) is currently over — cards aren't targets, so this is
   * read from the cursor position itself, each frame, like the transit dot */
  const [cardUnder, setCardUnder] = useState<LevelId | null>(null);
  const cardRefs = useRef(new Map<LevelId, HTMLDivElement>());
  /** per setting: a stamp that changes on each − / + press, so the value's highlight replays */
  const [changed, setChanged] = useState<Partial<Record<LevelId, number>>>({});
  const [tab, setTab] = useState<Tab>("gestures");
  /** the action whose gesture is being chosen (chooser open) */
  const [slot, setSlot] = useState<GestureSlot | null>(null);
  /** the "More" popup: its menu, or one of its pages */
  const [more, setMore] = useState<MoreView | null>(null);
  /** a More page too big for the panel (About controls, Technicalities), open over the whole Account block */
  const [fullPage, setFullPage] = useState<"advanced" | "tech" | null>(null);
  const advanced = fullPage !== null;
  useEffect(() => {
    onCover?.(advanced);
    return () => onCover?.(false); // leaving Account with it open mustn't leave the tabs switched off
  }, [advanced, onCover]);
  const [hover, setHover] = useState<string | null>(null);
  /** a one-off note after a change (e.g. a gesture moved from another action) */
  const [notice, setNotice] = useState<string | null>(null);
  /** a picked gesture or preset, shown for confirmation before it's applied (no accidental switching) */
  const [pending, setPending] = useState<Pending | null>(null);

  const update = (next: IsntSettings) => settingsStore.set({ isnt: next });

  const act = useCallback((target: FocusTarget | null, action: string) => {
    const p = target?.payload ?? {};
    const s = settingsStore.get().isnt;
    switch (action) {
      case "IS_TAB": setTab(p.tab as Tab); setSlot(null); setMore(null); setPending(null); setNotice(null); break;
      case "IS_MORE": setMore((m) => (m ? null : "menu")); setSlot(null); break;
      case "IS_MORE_VIEW": if (p.view === "advanced" || p.view === "tech") { setMore(null); setFullPage(p.view); } else setMore(p.view as MoreView); break;
      case "IS_ADV_BACK": setFullPage(null); setMore("menu"); break;
      case "IS_ADV_CLOSE": setFullPage(null); break;
      case "IS_MORE_CLOSE": setMore(null); break;
      case "IS_SLOT": setSlot(p.slot as GestureSlot); setNotice(null); break;
      case "IS_CLOSE": setSlot(null); setPending(null); break;
      // picking a gesture or a preset only asks; IS_APPLY (the confirmation's "Change") makes the change
      case "IS_PICK": setPending({ kind: "pick", slot: p.slot as GestureSlot, gesture: (p.gesture as IsntGesture | null) ?? null }); break;
      case "IS_PRESET": setPending({ kind: "preset", id: p.id as string }); break;
      case "IS_CANCEL": setPending(null); break;
      case "IS_APPLY": {
        setPending(null);
        if (p.kind === "preset") {
          const next = applyPreset(s, p.id as string, Date.now());
          update(next);
          setNotice(next.confirmTrial && next.confirm !== s.confirm ? trialNotice(next.confirm) : PRESET_NOTICE);
          break;
        }
        const sl = p.slot as GestureSlot;
        const r = assign(s, sl, (p.gesture as IsntGesture | null) ?? null, Date.now());
        if (!r.ok) break;
        update(r.settings);
        setNotice(sl === "CONFIRM" && r.settings.confirmTrial ? trialNotice(r.settings.confirm) : r.moved ? movedNotice(p.gesture as IsntGesture, r.moved) : null);
        setSlot(null);
        break;
      }
      case "IS_STEP": {
        const next = stepLevel(s, p.id as LevelId, p.delta as 1 | -1);
        if (next === s) break;
        update(next);
        setChanged((c) => ({ ...c, [p.id as string]: (c[p.id as LevelId] ?? 0) + 1 }));
        break;
      }
      case "IS_FLIP": update(p.axis === "x" ? { ...s, flipX: !s.flipX } : { ...s, flipY: !s.flipY }); break;
      case "IS_RESET": update(resetMovement(s)); setNotice(RESET_NOTICE); break;
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
  }, [tab, slot, more, advanced, pending]);

  // a notice (e.g. "moved from …") shows for a while, then the strip goes back to explaining what's pointed at
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(id);
  }, [notice]);

  const ex = explanations(isnt, slot);
  useEffect(() => {
    if (tab !== "movement") return;
    let raf = 0;
    let current: LevelId | null | undefined = undefined; // undefined: always publish the first reading
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const grid = labStore.latest.grid;
      const pt = grid && pipeline.focus.pointerToViewport(grid.cursorX, grid.cursorY);
      let under: LevelId | null = null;
      if (pt) for (const [id, el] of cardRefs.current) {
        const r = el.getBoundingClientRect();
        if (pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom) { under = id; break; }
      }
      if (under !== current) { current = under; setCardUnder(under); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tab]);
  /** a card is highlighted while the head pointer is over it, one of its − / + is focused, or the mouse is on it */
  const underCard = tab === "movement" ? cardUnder : null;
  const cardActive = (id: LevelId) => underCard === id || focusId === `is-step-${id}-down` || focusId === `is-step-${id}-up` || hover === `card-${id}`;

  const cardText = (id: LevelId | null) => { const l = id && LEVELS.find((x) => x.id === id); return l ? `${l.label}: ${l.explain}` : null; };
  const pointed = (hover && (ex[hover] ?? cardText(hover.replace(/^card-/, "") as LevelId))) || (focusId && ex[focusId]) || cardText(underCard) || null;
  /** `covered`: sits under the open chooser — rendered, but not a head target (like Recents under its menu) */
  /** `shade`: the tile's surface and its dwell fill. A disabled tile fades as a whole (surface included), except
   * the current choice, which stays readable. */
  const tile = (target: FocusTarget, content: React.ReactNode, opts: { active?: boolean; disabled?: boolean; covered?: boolean; className?: string; variant?: "default" | "secondary" | "ghost"; shade?: Shade } = {}) => {
    const tinted = !!opts.shade;
    return (
    <ChatFocusable
      key={target.id}
      target={target}
      enabled={enabled && !opts.disabled && !opts.covered}
      flashKey={lastFlash[target.id]}
      radius="rounded-2xl"
      className={cn(tinted && "pastel", opts.disabled && !opts.active && "opacity-40")}
      style={opts.shade ? ({ ["--tint" as string]: opts.shade.tint, ["--fill" as string]: opts.shade.fill } as React.CSSProperties) : undefined}
      onActivate={opts.disabled ? undefined : activate}
    >
      <Button
        variant={tinted ? "ghost" : opts.variant ?? "secondary"}
        disabled={opts.disabled}
        onMouseEnter={() => setHover(target.id)}
        onMouseLeave={() => setHover((h) => (h === target.id ? null : h))}
        className={cn("h-full w-full whitespace-normal rounded-2xl px-4 text-[15px] font-normal leading-snug disabled:opacity-100", tinted && "hover:bg-transparent", opts.active && "ring-2 ring-inset ring-foreground/60" /* inset: the focusable wrapper clips anything outside */, opts.className)}
      >
        {content}
      </Button>
    </ChatFocusable>
    );
  };

  /** Gestures | Movement: styled like the New chat / Recents / Account tabs — the selected one a darker grey
   * (bg-accent), the others hairline-bordered with muted text; no outline */
  const tabTile = (id: Tab, label: string, icon: React.ReactNode) => {
    const target = t(`tab-${id}`, label, "IS_TAB", { tab: id });
    const active = tab === id;
    return (
      <ChatFocusable key={target.id} target={target} enabled={enabled && !more && !advanced} flashKey={lastFlash[target.id]} radius="rounded-2xl" className={cn("transition-colors", active ? "bg-accent" : "bg-background ring-1 ring-inset ring-border")} onActivate={activate}>
        <Button
          variant="ghost"
          aria-current={active ? "page" : undefined}
          onMouseEnter={() => setHover(target.id)}
          onMouseLeave={() => setHover((h) => (h === target.id ? null : h))}
          className={cn("h-full w-full gap-2 rounded-2xl text-[15px] hover:bg-transparent", active ? "font-medium text-foreground" : "font-normal text-muted-foreground")}
        >
          {icon} {label}
        </Button>
      </ChatFocusable>
    );
  };

  /** a popup (gesture chooser or More) covers the tab body: what's under it isn't a head target */
  const overlay = !!slot || !!more || advanced || !!pending;

  // on the page background, not bg-card: in dark mode the card surface is the same colour as the secondary
  // tiles (#2f2f2f), which would make every tile invisible
  return (
    <section aria-label="ISNT settings" data-tab={tab} className="isnt-settings relative flex min-h-0 flex-col gap-3 rounded-[24px] border border-border bg-background p-4 animate-in fade-in duration-300" style={{ ...style, ["--isnt-cooldown" as string]: `${HOLD_VISIBLE_MS + cooldownMs}ms` }}>
      <div className="grid h-12 shrink-0 grid-cols-2 gap-3">
        {tabTile("gestures", "Gestures", <Sparkles className="size-5" />)}
        {tabTile("movement", "Movement", <Move className="size-5" />)}
      </div>

      <div className="relative min-h-0 flex-1">
        {tab === "gestures" ? (
          // the same card layout as Movement, in purple: Confirm + Writing + a preset left, Getting around +
          // On / off + a preset right
          <div className="grid h-full grid-flow-col gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(5, minmax(0, 1fr))" }}>
            {ACTION_GROUPS.flatMap((group, gi) => [
              <section key={group.name} aria-label={group.name} className="grid min-h-0 gap-1.5 rounded-[20px] p-1.5" style={{ gridRow: `span ${group.slots.length}`, gridTemplateRows: `repeat(${group.slots.length}, minmax(0, 1fr))`, background: `var(--purple-${group.shade})` }}>
                {group.slots.map((id) => {
                  const a = ACTIONS.find((x) => x.id === id)!;
                  const g = gestureOf(isnt, id);
                  return tile(
                    t(`slot-${id}`, `Gesture for ${a.label}`, "IS_SLOT", { slot: id }),
                    <span className="flex w-full flex-col items-start gap-0.5 text-left">
                      <span className={cn("text-xs", id === "CONFIRM" ? "font-semibold uppercase tracking-[0.08em]" : "opacity-70")}>{a.label}</span>
                      <span className={cn("text-[16px] font-medium", !g && "text-muted-foreground")}>{g ? gestureLabel(g) : "No gesture"}</span>
                    </span>,
                    { active: slot === id, covered: overlay, shade: onPurple(group.shade) },
                  );
                })}
              </section>,
              // a preset closes each column
              ...(gi === 1 || gi === 3 ? [PRESETS[gi === 1 ? 0 : 1]].map((p) => tile(t(`preset-${p.id}`, `Preset: ${p.label}`, "IS_PRESET", { id: p.id }), <span className="flex items-center gap-2"><Check className="size-4" /> Preset: {p.label}</span>, { variant: "ghost", covered: overlay, className: "border border-dashed border-border" })) : []),
            ])}
          </div>
        ) : (
          // related settings share one blue card (a shade per group); the 5-row grid keeps every row the same
          // height across both columns: Pointer movement + Head range left, Head scroll + Gestures + Reset right
          <div className="grid h-full grid-flow-col gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(5, minmax(0, 1fr))" }}>
            {MOVEMENT_GROUPS.map((group) => {
              const levels = LEVELS.filter((l) => l.group === group);
              const flips = group === "Head range";
              const rows = levels.length + (flips ? 1 : 0);
              return (
                <section key={group} aria-label={group} className="grid min-h-0 gap-1.5 rounded-[20px] p-1.5" style={{ gridRow: `span ${rows}`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, background: `var(--blue-${GROUP_TINT[group]})` }}>
                  {levels.map((l) => {
                    const i = isnt.levels[l.id];
                    return (
                      // the row itself isn't clickable (only − / + are), so it gets a static highlight, never the arming fill
                      <div
                        key={l.id}
                        ref={(el) => { if (el) cardRefs.current.set(l.id, el); else cardRefs.current.delete(l.id); }}
                        onMouseEnter={() => setHover(`card-${l.id}`)}
                        onMouseLeave={() => setHover((h) => (h === `card-${l.id}` ? null : h))}
                        className={cn("flex min-h-0 items-stretch gap-2 rounded-[14px] bg-background p-1.5 transition-shadow duration-150", cardActive(l.id) && "ring-2 ring-foreground/45")}
                      >
                        {/* − | name, value, level | + */}
                        <div className="grid w-14 shrink-0">
                          {tile(t(`step-${l.id}-down`, `${l.label}: less`, "IS_STEP", { id: l.id, delta: -1 }), <Minus className="size-5" />, { disabled: i === 0, covered: overlay, className: "px-0", shade: blue(GROUP_TINT[group]) })}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-center">
                          <div className="max-w-full truncate text-[15px]">{l.label}</div>
                          <span key={changed[l.id] ?? 0} className={cn("inline-block px-0.5 text-[15px] font-semibold tabular-nums", changed[l.id] && "isnt-value-pop")}>{l.display[i]}</span>
                          <span className="flex gap-1" aria-hidden>{l.display.map((_, k) => <span key={k} className="h-[3px] w-3.5 rounded-full" style={{ background: k <= i ? `var(--blue-fill-${GROUP_TINT[group]})` : "color-mix(in oklch, var(--foreground) 10%, transparent)" }} />)}</span>
                        </div>
                        <div className="grid w-14 shrink-0">
                          {tile(t(`step-${l.id}-up`, `${l.label}: more`, "IS_STEP", { id: l.id, delta: 1 }), <Plus className="size-5" />, { disabled: i === l.display.length - 1, covered: overlay, className: "px-0", shade: blue(GROUP_TINT[group]) })}
                        </div>
                      </div>
                    );
                  })}
                  {flips && (
                    <div className="grid min-h-0 grid-cols-2 gap-1.5 rounded-[14px] bg-background p-1.5">
                      {tile(t("flip-x", "Flip left / right", "IS_FLIP", { axis: "x" }), <span className="flex flex-col"><span className="text-xs opacity-70">Flip left/right</span>{isnt.flipX ? "On" : "Off"}</span>, { active: isnt.flipX, covered: overlay, className: "px-2", shade: blue(GROUP_TINT[group]) })}
                      {tile(t("flip-y", "Flip up / down", "IS_FLIP", { axis: "y" }), <span className="flex flex-col"><span className="text-xs opacity-70">Flip up/down</span>{isnt.flipY ? "On" : "Off"}</span>, { active: isnt.flipY, covered: overlay, className: "px-2", shade: blue(GROUP_TINT[group]) })}
                    </div>
                  )}
                </section>
              );
            })}
            {tile(t("reset", "Reset movement settings", "IS_RESET"), <span className="flex items-center gap-2"><RotateCcw className="size-5" /> Reset to defaults</span>, { variant: "ghost", covered: overlay, className: "border border-dashed border-border" })}
          </div>
        )}

        {slot && (
          <div className="absolute inset-0 z-[5] flex flex-col gap-2 rounded-2xl border border-border bg-background p-3 shadow-[0_8px_32px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-200" role="dialog" aria-label={`Gesture for ${ACTIONS.find((a) => a.id === slot)!.label}`}>
            <div className="px-1 text-xs font-medium text-muted-foreground">Gesture for “{ACTIONS.find((a) => a.id === slot)!.label}”</div>
            <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateRows: `repeat(${GESTURE_FAMILIES.length + 1}, minmax(0, 1fr))` }}>
              {GESTURE_FAMILIES.map((f) => (
                <section key={f.name} aria-label={f.name} className="grid min-h-0 gap-1.5 rounded-[18px] p-1.5" style={{ gridTemplateColumns: `repeat(${f.ids.length}, minmax(0, 1fr))`, background: `var(--purple-${f.shade})` }}>
                  {f.ids.map((id) => {
                    const g = GESTURES.find((x) => x.id === id)!;
                    const current = gestureOf(isnt, slot) === id;
                    const blocked = blockedReason(isnt, slot, id);
                    const usedBy = slotOf(isnt, id);
                    const note = current ? "Current" : blocked ? (slot === "CONFIRM" ? "Can't confirm" : "Used to confirm") : usedBy ? `Now: ${ACTIONS.find((a) => a.id === usedBy)!.label}` : null;
                    return tile(
                      t(`pick-${id}`, g.label, "IS_PICK", { slot, gesture: id }),
                      <span className="flex flex-col items-center gap-0.5"><span>{g.label}</span>{note && <span className="text-[11px] opacity-70">{note}</span>}</span>,
                      { active: current, disabled: !!blocked || current, covered: !!pending, className: "px-2", shade: onPurple(f.shade) },
                    );
                  })}
                </section>
              ))}
              <div className="grid min-h-0 grid-flow-col gap-2" style={{ gridAutoColumns: "minmax(0, 1fr)" }}>
                {slot !== "CONFIRM" && tile(t("pick-none", "No gesture", "IS_PICK", { slot, gesture: null }), "No gesture", { variant: "ghost", disabled: !gestureOf(isnt, slot), covered: !!pending, className: "border border-dashed border-border" })}
                {tile(t("close", "Close", "IS_CLOSE"), <span className="flex items-center gap-1.5 text-muted-foreground"><X className="size-5" /> Close</span>, { variant: "ghost", covered: !!pending })}
              </div>
            </div>
          </div>
        )}

        {pending && (
          <div className="absolute inset-0 z-[6] grid gap-3 rounded-2xl border border-border bg-background p-3 shadow-[0_8px_32px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-200" style={{ gridTemplateRows: "minmax(0, 1.2fr) minmax(0, 1fr)" }} role="alertdialog" aria-label="Confirm change">
            <ChangeSummary pending={pending} isnt={isnt} />
            <div className="grid min-h-0 grid-cols-2 gap-3">
              {tile(t("cancel", "Cancel", "IS_CANCEL"), <span className="flex items-center gap-2"><X className="size-5" /> Cancel</span>, { variant: "ghost", className: "border border-dashed border-border" })}
              {tile(t("apply", "Change", "IS_APPLY", pending), <span className="flex items-center gap-2 font-medium"><Check className="size-5" /> Change</span>, { variant: "default" })}
            </div>
          </div>
        )}
      </div>

      {/* bottom row: what the thing being pointed at does, in plain words — and More in the corner, as tall as the strip */}
      <div className="flex shrink-0 items-stretch gap-3">
      {/* fixed height: every possible text is stacked invisibly in the same grid cell, so the box is always as tall
          as the longest one at this width — it never grows or shrinks with focus. The font scales down a little on
          small viewports instead of the box growing tall. */}
      <div className="grid min-w-0 flex-1 rounded-xl bg-muted/50 px-4 py-2 leading-snug text-muted-foreground" style={{ fontSize: "clamp(11px, 0.45vw + 7px, 13px)" }} data-strip>
        {STRIP_TEXTS.map((text) => <span key={text} aria-hidden className="invisible [grid-area:1/1]">{text}</span>)}
        <p className="[grid-area:1/1]" aria-live="polite">{notice ?? pointed ?? IDLE_TEXT}</p>
      </div>
      <div className="grid w-[7.5rem] shrink-0">
        {tile(t("more", "More", "IS_MORE"), <span className="flex items-center gap-2"><MoreHorizontal className="size-5" /> More</span>, { active: !!more || advanced, covered: !!more || advanced })}
      </div>
      </div>

      {more && (
        <TilePanel
          className="absolute inset-0 rounded-[24px]" // covers the whole settings panel (room for the legend on short screens); same corners
          title={more === "menu" ? "More" : MORE_PAGES[more].title}
          items={more === "menu"
            ? (["legend", "tech", "advanced"] as const).map((v) => ({ target: t(`more-${v}`, MORE_PAGES[v].title, "IS_MORE_VIEW", { view: v }), icon: MORE_PAGES[v].icon, label: MORE_PAGES[v].title }))
            : [{ target: t("more-back", "Back", "IS_MORE_VIEW", { view: "menu" }), icon: <ArrowLeft />, label: "Back" }]}
          close={t("more-close", "Close", "IS_MORE_CLOSE")}
          enabled={enabled}
          lastFlash={lastFlash}
          onActivate={activate}
          onHover={setHover}
        >
          {more === "legend" ? <ColorLegend /> : undefined}
        </TilePanel>
      )}
      {fullPage && advancedHost && createPortal(
        <TilePanel
          className="pointer-events-auto absolute inset-0"
          tilesClassName="h-[clamp(3rem,7vh,4.5rem)]" // a lower Back / Close row: the table needs the height
          title={MORE_PAGES[fullPage ?? "advanced"].title}
          items={[{ target: t("adv-back", "Back", "IS_ADV_BACK"), icon: <ArrowLeft />, label: "Back" }]}
          close={t("adv-close", "Close", "IS_ADV_CLOSE")}
          enabled={enabled}
          lastFlash={lastFlash}
          onActivate={activate}
          onHover={setHover}
        >
          {fullPage === "tech" ? <Technicalities active={enabled} /> : <AdvancedTable active={enabled} />}
        </TilePanel>,
        advancedHost,
      )}
    </section>
  );
}
