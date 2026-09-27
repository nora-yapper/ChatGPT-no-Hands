"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ArrowUp, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, Clock, Keyboard, MessageSquare, MessagesSquare, SquarePen, Undo2, User } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import type { ActionEvent, FocusTarget } from "@/types/interaction";
import { pipeline } from "@/pipeline/Pipeline";
import type { Predictions } from "@/chat/predictionRules";
import { cn } from "@/lib/utils";
import { AccountScreen } from "./AccountScreen";
import { ChatFocusable } from "./ChatFocusable";
import { TailText } from "./TailText";
import { useFocusArea } from "./useFocusArea";
import { useMeasuredGrid } from "./useMeasuredGrid";
import { RecentsScreen } from "./recents/RecentsScreen";
import { ChatTranscript } from "./ChatTranscript";
import type { ChatMessage } from "@/chat/assistant";
import type { RecentChat } from "./recents/recentsStore";
import { BAR_BACK, BAR_EXPAND, BAR_KEYBOARD, BAR_SEND, BASE_COLS, BASE_PLACEMENT, BASE_ROW_TEMPLATE, BASE_SNAP, COMPASS_ROWS, NAV, PHRASE_SLOTS, READ_DOWN, READ_REPLY, READ_UP, SHOW_CONVERSATION, STARTER_ROWS, compassTints, fillTint, slotTarget, slotText, starterTarget, tint, type Phase, type Screen, type Slot, type Span } from "./spatial";

export interface NoHandsScreenProps {
  /** the element the head pointer maps onto — the whole window, so the sidebar is reachable too. Its
   * `[data-target]`s (sidebar included) are the Grid Glide fields; the parent draws the transit dot in it. */
  areaRef: RefObject<HTMLDivElement | null>;
  /** anything outside this screen that moves its fields (sidebar open/closed, …): re-measure when it changes */
  areaKey?: string;
  screen: Screen;
  phase: Phase;
  prompt: string;
  predictions: Predictions | null;
  loading: boolean;
  sending: boolean;
  /** a segment exists that Back can remove */
  canUndo: boolean;
  /** the full prompt panel is open over the compass */
  expanded: boolean;
  /** false while the keyboard modal owns the pointer */
  enabled: boolean;
  lastFlash: Record<string, number>;
  onActivate: (t: FocusTarget) => void;
  /** "read": the conversation fills the block and the composer is collapsed; "compose": the word grid is shown */
  mode: "read" | "compose";
  /** the conversation so far (rendered in read mode, and reachable from compose mode once it exists) */
  messages: ChatMessage[];
  transcriptRef: RefObject<HTMLDivElement | null>;
  /** the starter word the user chose first (null if the prompt began with typed text) — drives the compass colours */
  firstStarter: string | null;
  /** identifies that first choice, so the random word colour is fixed for the whole prompt */
  firstPickId: number;
  /** Recents: open a stored conversation in New Chat */
  onOpenChat: (chat: RecentChat) => void;
  /** Recents: the conversation currently loaded in New Chat */
  currentChatId: string | null;
  /** Recents: start a brand-new chat filed under the given project */
  onNewChatInProject: (projectId: string) => void;
  /** Account: the profile fields shown (and editable) in the left third */
  accountName: string;
  accountEmail: string;
}

const place = (s: Span, extra?: React.CSSProperties): React.CSSProperties => ({ gridColumn: s.col, gridRow: s.row, ...extra });
const CELL = "h-full w-full whitespace-normal rounded-2xl text-[17px] font-normal leading-snug";

/* ───────────── pick transition ─────────────
 * The compass centre only ever shows the *latest* pick — not the whole growing prompt, which is already
 * visible in the prompt bar below. So there's nothing to append into and nothing to keep stable: a ghost of
 * the picked card glides toward the centre, its pastel background fading to nothing and its box shrinking
 * to the word's real size as it goes, while every other option on screen fades out. By the time it arrives
 * it already looks exactly like the real centre text about to take its place, so the handoff between them
 * is a hard, same-frame swap rather than a second fade — nothing to flicker, it just stays put. The compass
 * fields simply fade back in around it after that, lightly staggered clockwise from the top. */
const FLIGHT_MS = 460;
/** picks that don't originate from a clicked card (typed via the on-screen keyboard) have no button to fly
 * from — just a brief, deliberate beat before the refreshed fields settle back in, so the reveal still
 * reads as a soft update rather than an instant swap */
const REVEAL_HOLD_MS = 90;
/** how long a compass field's fade-in + colour bloom takes */
const REVEAL_FADE_MS = 600;
/** the reveal's light clockwise stagger, from the top: each field starts this much after the previous one */
const REVEAL_STAGGER_MS = 35;
const CLOCKWISE: Slot[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)"; // smooth deceleration, no overshoot
interface Flight {
  text: string;
  tint: string;
  from: DOMRect;
  /** whether the picked card was a starter (so the starters grid needs fading out too) or a compass field */
  origin: "starter" | "slot";
  /** phrase fields render smaller than word fields and the centre text — the ghost grows to match as it lands */
  isPhrase: boolean;
}

/**
 * The head-controlled surface of ChatGPT No Hands, laid out on a fine base grid: a Keyboard column on the
 * left, an empty gutter, then the 15-column main block (starters or compass, the input bar, the tabs).
 * Every control spans whole base cells and the Grid Glide fields are the controls' own boxes, measured
 * from the DOM. Positions never move; only the content changes. Colour follows position: each compass
 * slot keeps its pastel hue, so the colour wheel is part of the spatial grammar.
 */
export function NoHandsScreen(p: NoHandsScreenProps) {
  useFocusArea(p.areaRef, p.enabled);
  /** the block the glide speed is tuned to (it used to be the whole pointer area) */
  const blockRef = useRef<HTMLDivElement | null>(null);

  const canSend = p.prompt.trim().length > 0 && !p.sending;
  const [overflow, setOverflow] = useState(false);
  const onOverflow = useCallback((o: boolean) => setOverflow(o), []);
  const expandable = overflow || p.expanded;
  const layoutKey = JSON.stringify([p.areaKey, p.screen, p.mode, p.phase, p.predictions, p.loading, canSend, p.canUndo, expandable, p.expanded, p.messages.length, p.sending]);
  useMeasuredGrid(p.areaRef, p.enabled, layoutKey, BASE_SNAP, blockRef);
  const gridEnabled = p.enabled && !p.expanded;
  const isNew = p.screen === "new";
  const reading = isNew && p.mode === "read";
  const composing = isNew && p.mode === "compose";
  const hasConversation = p.messages.length > 0 || p.sending;
  const tints = compassTints(p.firstStarter, p.firstPickId);

  // ── pick transition: see the block comment near FLIGHT_MS above ──
  const [flight, setFlight] = useState<Flight | null>(null);
  const [toRect, setToRect] = useState<DOMRect | null>(null);
  const [flying, setFlying] = useState(false);
  const [revealed, setRevealed] = useState(true);
  /** just the latest pick's own text — never the whole prompt, which is already shown in the bar below */
  const [displayText, setDisplayText] = useState(p.prompt);
  /** points at the centre's text wrapper, so the ghost has something real to aim for */
  const centerTextRef = useRef<HTMLDivElement | null>(null);

  const startFlight = useCallback((t: FocusTarget, tintColor: string, origin: Flight["origin"], isPhrase: boolean) => {
    const el = document.querySelector<HTMLElement>(`[data-target="${t.id}"]`);
    if (!el) return;
    setFlight({ text: t.label, tint: tintColor, from: el.getBoundingClientRect(), origin, isPhrase });
    setRevealed(false);
  }, []);
  // mouse / click: the card's own onActivate
  const handlePick = useCallback(
    (t: FocusTarget, tintColor: string, origin: Flight["origin"], isPhrase: boolean) => {
      startFlight(t, tintColor, origin, isPhrase);
      p.onActivate(t);
    },
    [p, startFlight],
  );
  // head: a confirmed pick arrives through the dispatcher (the parent applies it) and never passes through the
  // card's onActivate — so start the same glide from here. Runs synchronously with the dispatch, before React
  // re-renders, so the card is still where it was; its colour is read back from its own --tint.
  useEffect(
    () =>
      pipeline.dispatcher.register((a: ActionEvent) => {
        if (a.action !== "PICK" || !a.target) return;
        const el = document.querySelector<HTMLElement>(`[data-target="${a.target.id}"]`);
        const slot = a.target.payload?.slot as Slot | undefined;
        if (!el) return;
        startFlight(a.target, el.style.getPropertyValue("--tint"), slot ? "slot" : "starter", !!slot && (PHRASE_SLOTS as readonly string[]).includes(slot));
      }),
    [startFlight],
  );

  // once the compass has mounted alongside an in-flight pick, measure where the word is going to land. If it
  // can't be measured (e.g. the centre text isn't mounted yet), the arrive timer below still resolves things.
  useLayoutEffect(() => {
    if (!flight) return;
    const el = centerTextRef.current;
    if (!el) return;
    setToRect(el.getBoundingClientRect());
  }, [flight]);

  // paint the glide's start frame (the word still at the starter's position), then flip to its end frame on
  // the next frame so the CSS transition actually animates between the two, instead of jumping straight there;
  // "arrival" always resolves after FLIGHT_MS regardless of whether the target was ever successfully measured
  useEffect(() => {
    if (!flight) return;
    const raf = requestAnimationFrame(() => setFlying(true));
    const arrive = setTimeout(() => {
      setRevealed(true);
      setFlight(null);
      setToRect(null);
      setFlying(false);
    }, FLIGHT_MS);
    return () => { cancelAnimationFrame(raf); clearTimeout(arrive); };
  }, [flight]);

  // every pick after the first: no flight to wait for, so just briefly hide and replay the same radiate-in
  // reveal for the refreshed compass fields and centre text, instead of swapping them in instantly.
  // Adjusting state in response to a prop change, during render rather than an effect (the now-removed
  // `useLeaving` hook used this same pattern): always resync `prevPrompt` so a later render never sees a
  // stale mismatch. `displayText` — the bit just added since the last pick (or the whole prompt, for the
  // rare case that doesn't cleanly diff, e.g. Back) — updates right away: it's hidden behind `revealed`
  // until the reveal plays, so there's nothing to see happen yet.
  const [prevPrompt, setPrevPrompt] = useState(p.prompt);
  if (p.prompt !== prevPrompt) {
    setPrevPrompt(p.prompt);
    setDisplayText(p.prompt.startsWith(prevPrompt) ? p.prompt.slice(prevPrompt.length).replace(/^\s+/, "") : p.prompt);
    if (!flight) setRevealed(false);
  }
  useEffect(() => {
    if (revealed || flight) return;
    const hold = setTimeout(() => setRevealed(true), REVEAL_HOLD_MS);
    return () => clearTimeout(hold);
  }, [revealed, flight]);

  const content = () => {
    if (reading) {
      return (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-border bg-card animate-in fade-in duration-300" style={place(BASE_PLACEMENT.transcript)} role="region" aria-label="Conversation">
          <ChatTranscript ref={p.transcriptRef} messages={p.messages} thinking={p.sending} />
        </div>
      );
    }
    if (p.screen === "recents") return <RecentsScreen enabled={p.enabled} lastFlash={p.lastFlash} onActivate={p.onActivate} onOpenChat={p.onOpenChat} currentChatId={p.currentChatId} onNewChatInProject={p.onNewChatInProject} />;
    if (p.screen === "account") return <AccountScreen enabled={p.enabled} lastFlash={p.lastFlash} onActivate={p.onActivate} name={p.accountName} email={p.accountEmail} />;
    // `out`: rendered with a fresh key, deliberately — ChatFocusable renders an entirely different element
    // tree once `enabled` goes false, so it *cannot* smoothly transition in place; it needs a real mount-time
    // animation (`animate-out`) rather than a transition, which would just jump straight to its end state
    const starters = (out: boolean) =>
      STARTER_ROWS.flat()
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => !(out && flight?.text === w)) // the picked word vanishes instantly — its ghost takes over
        .map(({ w, i }) => {
          const t = starterTarget(w);
          const tintColor = tint(i);
          return (
            <ChatFocusable
              key={`${t.id}${out ? "-out" : ""}`}
              target={t}
              enabled={gridEnabled && !out}
              flashKey={p.lastFlash[t.id]}
              radius="rounded-2xl"
              className={cn("pastel", out && "pointer-events-none animate-out fade-out fill-mode-forwards duration-300 ease-out")}
              style={place(BASE_PLACEMENT.starter(i), { ["--tint" as string]: tintColor, ["--fill" as string]: fillTint(i) })}
              onActivate={(target) => handlePick(target, tintColor, "starter", false)}
            >
              <Button variant="ghost" className={cn(CELL, "text-xl hover:bg-transparent")}>{w}</Button>
            </ChatFocusable>
          );
        });
    if (p.phase === "starters") return starters(false);
    return (
      <>
        {flight?.origin === "starter" && starters(true)}
        {COMPASS_ROWS.flatMap((row, r) =>
          row.map((slot, c) => {
            if (!slot) return <CenterCell key="center" span={BASE_PLACEMENT.compass(r, c)} text={displayText} loading={p.loading} textRef={centerTextRef} revealed={revealed} />;
            const isPhrase = (PHRASE_SLOTS as readonly string[]).includes(slot);
            const tintIndex = isPhrase ? tints.phrase : tints.word;
            return (
              <SlotCell
                key={slot}
                slot={slot}
                span={BASE_PLACEMENT.compass(r, c)}
                tintIndex={tintIndex}
                revealed={revealed}
                {...p}
                enabled={gridEnabled}
                onActivate={(t) => handlePick(t, tint(tintIndex), "slot", isPhrase)}
              />
            );
          }),
        )}
        {flight && <FlightGhost flight={flight} toRect={toRect} flying={flying} />}
      </>
    );
  };

  return (
    <div ref={blockRef} className="relative mx-auto w-full min-h-0 max-w-[1180px] flex-1 px-16">
      <div className="relative grid h-full min-h-0 gap-2 pb-6 pt-8" style={{ gridTemplateColumns: `repeat(${BASE_COLS}, minmax(0, 1fr))`, gridTemplateRows: BASE_ROW_TEMPLATE }}>
        {content()}

        {p.expanded && composing && (
          <div className="z-[5] flex min-h-0 flex-col rounded-[24px] border border-border bg-card p-5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-2 duration-200" style={place(BASE_PLACEMENT.content)} role="region" aria-label="Full prompt">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Your prompt</span>
              <span>{p.prompt.trim().split(/\s+/).filter(Boolean).length} words</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-lg leading-relaxed">{p.prompt}</div>
          </div>
        )}

        {/* keyboard escape hatch: the left column; shares it with "Show conversation" once a conversation exists */}
        <ChatFocusable target={BAR_KEYBOARD} enabled={p.enabled && composing} flashKey={p.lastFlash[BAR_KEYBOARD.id]} radius="rounded-2xl" className={cn("bg-muted", !composing && "invisible")} style={place(hasConversation ? BASE_PLACEMENT.keyboardSplit : BASE_PLACEMENT.keyboard)} onActivate={p.onActivate}>
          <Button variant="ghost" aria-label="Open keyboard" className={cn(CELL, "flex-col gap-2 text-[15px] text-muted-foreground hover:bg-accent")}>
            <Keyboard className="size-6" /> Keyboard
          </Button>
        </ChatFocusable>
        {composing && hasConversation && (
          <ChatFocusable target={SHOW_CONVERSATION} enabled={p.enabled} flashKey={p.lastFlash[SHOW_CONVERSATION.id]} radius="rounded-2xl" className="bg-muted" style={place(BASE_PLACEMENT.conversation)} onActivate={p.onActivate}>
            <Button variant="ghost" aria-label="Show conversation" className={cn(CELL, "flex-col gap-2 text-[15px] text-muted-foreground hover:bg-accent")}>
              <MessagesSquare className="size-6" /> Conversation
            </Button>
          </ChatFocusable>
        )}

        {/* reading mode bar: scroll up | scroll down | reply */}
        {reading && (
          <>
            <ChatFocusable target={READ_UP} enabled={p.enabled} flashKey={p.lastFlash[READ_UP.id]} radius="rounded-2xl" style={place(BASE_PLACEMENT.read.up)} onActivate={p.onActivate}>
              <Button variant="secondary" aria-label="Scroll up" className={cn(CELL, "flex-col gap-1.5 text-[15px] text-muted-foreground")}><ChevronUp className="size-6" /> Up</Button>
            </ChatFocusable>
            <ChatFocusable target={READ_DOWN} enabled={p.enabled} flashKey={p.lastFlash[READ_DOWN.id]} radius="rounded-2xl" style={place(BASE_PLACEMENT.read.down)} onActivate={p.onActivate}>
              <Button variant="secondary" aria-label="Scroll down" className={cn(CELL, "flex-col gap-1.5 text-[15px] text-muted-foreground")}><ChevronDown className="size-6" /> Down</Button>
            </ChatFocusable>
            <ChatFocusable target={READ_REPLY} enabled={p.enabled && !p.sending} flashKey={p.lastFlash[READ_REPLY.id]} radius="rounded-2xl" style={place(BASE_PLACEMENT.read.reply)} onActivate={p.onActivate}>
              <Button aria-label="Reply" disabled={p.sending} className={cn(CELL, "gap-3 text-[17px] disabled:opacity-40")}><MessageSquare className="size-6" /> {p.sending ? "Waiting for the reply…" : "Reply"}</Button>
            </ChatFocusable>
          </>
        )}

        {/* back: its own column on the right, as tall as the word grid */}
        <ChatFocusable target={BAR_BACK} enabled={p.enabled && composing && p.canUndo} flashKey={p.lastFlash[BAR_BACK.id]} radius="rounded-2xl" className={cn("bg-muted transition-opacity", !composing && "invisible", !p.canUndo && "opacity-40")} style={place(BASE_PLACEMENT.back)} onActivate={p.onActivate}>
          <Button variant="ghost" aria-label="Back: remove the last selection" disabled={!p.canUndo} className={cn(CELL, "flex-col gap-2 text-[15px] text-muted-foreground hover:bg-accent disabled:opacity-100")}>
            <Undo2 className="size-6" /> Back
          </Button>
        </ChatFocusable>
        {/* input bar: prompt (2/3) | send (1/3) */}
        <ChatFocusable target={{ ...BAR_EXPAND, label: p.expanded ? "Collapse prompt" : "Expand prompt" }} enabled={p.enabled && composing && expandable} flashKey={p.lastFlash[BAR_EXPAND.id]} radius="rounded-2xl" className={cn(!composing && "invisible")} style={place(BASE_PLACEMENT.bar.prompt)} onActivate={p.onActivate}>
          <div className={cn("relative flex h-full items-center rounded-2xl border border-composer-border bg-composer px-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]", expandable && "cursor-pointer")}>
            <TailText tail={p.prompt} onOverflow={onOverflow} fade className="max-h-[4.5rem] flex-1 text-base leading-6" aria-live="polite" aria-label="Current prompt">
              {p.prompt ? <PromptWords prompt={p.prompt} /> : <span className="text-muted-foreground">Build your prompt by choosing words</span>}
              {!p.sending && <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] animate-pulse bg-foreground" aria-hidden />}
            </TailText>
            {expandable && (
              <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-muted-foreground" aria-hidden>
                {p.expanded ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
                {p.expanded ? "Collapse" : "Expand"}
              </span>
            )}
          </div>
        </ChatFocusable>
        <ChatFocusable target={BAR_SEND} enabled={p.enabled && composing && canSend} flashKey={p.lastFlash[BAR_SEND.id]} radius="rounded-2xl" className={cn(!composing && "invisible")} style={place(BASE_PLACEMENT.bar.send)} onActivate={p.onActivate}>
          <Button aria-label="Send" disabled={!canSend} className={cn(CELL, "flex-col gap-1.5 text-[15px] disabled:opacity-20")}>
            <ArrowUp className="size-6" strokeWidth={2.5} /> Send
          </Button>
        </ChatFocusable>

        {/* tabs: as wide as the compass columns */}
        {(Object.keys(NAV) as Screen[]).map((s, i) => {
          const t = NAV[s];
          const active = p.screen === s;
          const Icon = s === "new" ? SquarePen : s === "recents" ? Clock : User;
          return (
            <ChatFocusable key={t.id} target={t} enabled={p.enabled} flashKey={p.lastFlash[t.id]} radius="rounded-2xl" className={cn("transition-colors", active ? "bg-accent" : "bg-background ring-1 ring-border")} style={place(BASE_PLACEMENT.nav(i))} onActivate={p.onActivate}>
              <Button variant="ghost" aria-current={active ? "page" : undefined} className={cn(CELL, "gap-2 text-[15px] hover:bg-transparent", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                <Icon className="size-5" /> {t.label}
              </Button>
            </ChatFocusable>
          );
        })}
      </div>
    </div>
  );
}

/** The newest word of the prompt; the rest stays put. */
function PromptWords({ prompt }: { prompt: string }) {
  const words = prompt.split(" ");
  const last = words.pop() ?? "";
  return (
    <>
      {words.length > 0 && words.join(" ") + " "}
      {last}
    </>
  );
}

/** A ghost of the picked card, gliding from its own position toward the compass centre — its pastel
 * background fading to nothing and its box shrinking as it goes — then dissolving completely as it
 * arrives, right as `CenterCell` crossfades to that same word or phrase. Renders `fixed` since the rects
 * it interpolates between were measured with `getBoundingClientRect`. */
function FlightGhost({ flight, toRect, flying }: { flight: Flight; toRect: DOMRect | null; flying: boolean }) {
  const arrived = flying && toRect;
  const at = arrived ? toRect : flight.from;
  return (
    <div
      aria-hidden
      // `text-center`: `justify-center` alone only centers the wrapped-text block as a whole — while the box
      // is narrower than its final width (mid-flight), a multi-word phrase wraps across lines that default
      // to left-aligned within that block, only looking centered again once the box reaches a width the
      // text fits on one line at
      className="pointer-events-none fixed z-50 flex items-center justify-center px-4 text-center font-normal leading-snug text-foreground"
      style={{
        left: at.left,
        top: at.top,
        width: at.width,
        height: at.height,
        // no opacity animation at all: by the time it "arrives" (right position/size, no background), it
        // already looks exactly like the real centre text about to take its place — a hard swap between the
        // two at that exact frame is imperceptible, and is simpler and tighter than trying to time two
        // separate fades to meet in the middle without ever leaving a gap where neither is visible
        fontSize: arrived ? "1.25rem" : flight.isPhrase ? "17px" : "1.25rem", // matches the centre text's text-xl as it dissolves
        backgroundColor: arrived ? "transparent" : flight.tint,
        borderRadius: arrived ? 0 : 16,
        transition: `left ${FLIGHT_MS}ms ${EASE}, top ${FLIGHT_MS}ms ${EASE}, width ${FLIGHT_MS}ms ${EASE}, height ${FLIGHT_MS}ms ${EASE}, background-color ${FLIGHT_MS}ms ${EASE}, border-radius ${FLIGHT_MS}ms ${EASE}, font-size ${FLIGHT_MS}ms ${EASE}`,
      }}
    >
      {flight.text}
    </div>
  );
}

function SlotCell({ slot, span, tintIndex, predictions, loading, enabled, lastFlash, onActivate, revealed }: { slot: Slot; span: Span; tintIndex: number; revealed: boolean } & NoHandsScreenProps) {
  const text = slotText(slot, predictions);
  const isPhrase = (PHRASE_SLOTS as readonly string[]).includes(slot);
  const tintValue = tint(tintIndex);
  const tintVar = { ["--tint" as string]: tintValue, ["--fill" as string]: fillTint(tintIndex) };
  // When predictions arrive *after* the reveal already played (on the loading placeholder), the real field
  // replaces the placeholder as a fresh element — hold it hidden for two frames so it fades in too, instead
  // of popping in at full opacity. (State adjusted during render, like `prevPrompt` above.)
  const ready = !loading && !!text;
  const [prevReady, setPrevReady] = useState(ready);
  const [entering, setEntering] = useState(false);
  if (ready !== prevReady) {
    setPrevReady(ready);
    if (ready) setEntering(true);
  }
  useEffect(() => {
    if (!entering) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setEntering(false)); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [entering]);
  const shown = revealed && !entering;
  // the tint itself blooms in alongside the opacity fade: starts blended almost entirely into the page
  // background (so it works in both themes) and eases up to full colour, rather than just fading in flat
  const bloomValue = `color-mix(in oklch, ${tintValue}, var(--background) 85%)`;
  const delay = shown ? CLOCKWISE.indexOf(slot) * REVEAL_STAGGER_MS : 0; // stagger the fade-in only, never the hide
  const revealStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    backgroundColor: shown ? tintValue : bloomValue,
    transition: `opacity ${REVEAL_FADE_MS}ms ${EASE} ${delay}ms, background-color ${REVEAL_FADE_MS}ms ${EASE} ${delay}ms`,
  };
  if (!ready) {
    return <div className="pastel h-full w-full animate-pulse rounded-2xl opacity-60" style={place(span, { ...tintVar, ...revealStyle })} aria-hidden />;
  }
  const t = slotTarget(slot, text);
  // `enabled` itself stays stable across the reveal (ChatFocusable renders a different element tree when it
  // toggles, which would defeat the transition below); `pointer-events-none` keeps it inert while invisible
  return (
    <ChatFocusable key={slot} target={t} enabled={enabled} flashKey={lastFlash[t.id]} radius="rounded-2xl" onActivate={onActivate} className={cn("pastel", !shown && "pointer-events-none")} style={place(span, { ...tintVar, ...revealStyle })}>
      <Button variant="ghost" className={cn(CELL, "px-4 hover:bg-transparent", isPhrase ? "text-[17px]" : "text-xl")}>
        {text}
      </Button>
    </ChatFocusable>
  );
}

/**
 * The already-settled part of the prompt (`settledPrompt`) is always shown, in full, never hidden — nothing
 * about it ever animates. Only the word or phrase just picked (the part of `prompt` past `settledPrompt`)
 * is new: it's split into characters and typed in one at a time, right where it actually sits in the
 * sentence, once `revealed` flips (timed to when that pick's ghost finishes dissolving).
 */
/** Shows only the latest pick — the full prompt is already visible in the bar below, so there's nothing
 * to keep stable and nothing to append into. Fades out with everything else while a pick is in flight, and
 * crossfades to the new word or phrase once it lands: same content the ghost was carrying the whole time,
 * just handed off, so there's nothing for the eye to catch as a cut. */
function CenterCell({ text, loading, span, textRef, revealed }: { text: string; loading: boolean; span: Span; textRef: RefObject<HTMLDivElement | null>; revealed: boolean }) {
  return (
    <div data-grid-empty className="flex h-full items-center justify-center px-3 text-center" style={place(span)}>
      {/* no transition here, deliberately: it flips to visible on the exact frame the ghost (which looked
          identical by then) disappears, so there's nothing left to separately fade — see FlightGhost */}
      <div ref={textRef} className="inline-block" style={{ opacity: revealed ? 1 : 0 }}>
        <TailText tail={text} className={cn("max-h-[5.25rem] text-xl font-medium leading-7 tracking-[-0.01em]", loading && "opacity-60")}>{text}</TailText>
      </div>
    </div>
  );
}
