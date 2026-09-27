"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLab } from "@/store/labStore";
import { useSettings } from "@/store/settingsStore";
import type { FocusTarget } from "@/types/interaction";
import { useFocusable } from "@/components/TestGui/useFocusable";
import { HOLD_VISIBLE_MS } from "@/interaction/InteractionStateMachine";
import { cn } from "@/lib/utils";

/** how fast the dwell fill tracks the (throttled) live progress sample — quick enough to feel responsive,
 * slow enough to smooth over the sampling steps */
const DWELL_TRACK_MS = 90;

interface Props {
  target: FocusTarget;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  flashKey?: number;
  radius?: string;
  /** false = render the control but don't register it (e.g. while a modal covers it) */
  enabled?: boolean;
  /** mouse / keyboard fallback: invoked with the target when the child is clicked */
  onActivate?: (target: FocusTarget) => void;
}

/**
 * A head-focusable target in ChatGPT's visual language. The control itself carries the whole head-tracking
 * lifecycle — no separate cursor/grid overlay:
 *   focused    → a subtle drop shadow lifts it off the page
 *   dwelling   → a bottom-to-top fill rises (a saturated version of the control's own colour, or light
 *                grey for a plain one), reaching 100% exactly as it arms
 *   confirming → one brief scale pulse, then settles back
 *   cooldown   → the fill eases back down to nothing, deliberately, not a snap
 * The child renders the control itself (usually a shadcn Button); this wrapper only adds the interaction
 * states and registers the element with the shared focus manager, exactly like the lab's FocusableTarget.
 */
export function ChatFocusable({ enabled = true, ...p }: Props) {
  if (!enabled) {
    return (
      <div className={cn("relative select-none overflow-hidden", p.radius ?? "rounded-xl", p.className)} style={p.style} onClick={() => p.onActivate?.(p.target)}>
        {p.children}
      </div>
    );
  }
  return <Registered {...p} />;
}

function Registered({ target, children, className, style, flashKey, radius = "rounded-xl", onActivate }: Omit<Props, "enabled">) {
  const ref = useFocusable<HTMLDivElement>(target);
  const lab = useLab();
  const cooldownMs = useSettings().thresholds.cooldownMs;
  const state = lab.interaction.state;
  const isArmedTarget = lab.interaction.armedTarget?.id === target.id;
  const focused = lab.focusId === target.id;
  const armed = isArmedTarget && (state === "ARMED" || state === "CONFIRMING");
  const confirming = isArmedTarget && state === "CONFIRMING";
  // EXECUTING/COOLDOWN: the gesture is done, but this is still the target it happened to — ease the fill
  // back down instead of snapping, so the "returning to default" reads as deliberate
  const cooling = isArmedTarget && (state === "EXECUTING" || state === "COOLDOWN");
  const holdProgress = focused && lab.gaze?.targetId === target.id ? lab.gaze.progress : 0;
  const fillProgress = armed ? 1 : cooling ? 0 : holdProgress;
  const fillDurationMs = cooling ? HOLD_VISIBLE_MS + cooldownMs : DWELL_TRACK_MS;
  const pulsing = useConfirmPulse(flashKey);

  return (
    <div
      ref={ref}
      data-target={target.id}
      data-focused={focused || undefined}
      data-armed={armed || undefined}
      data-confirming={confirming || undefined}
      data-cooling={cooling || undefined}
      style={{ ...style, boxShadow: armed ? "var(--chat-shadow-armed)" : focused || cooling ? "var(--chat-shadow-focus)" : undefined }}
      onClick={() => onActivate?.(target)}
      className={cn("relative select-none overflow-hidden transition-shadow duration-200", radius, pulsing && "chat-confirm-pulse", className)}
    >
      {/* dwell → armed → cooldown, all one fill: rises bottom-to-top while dwelling, holds full while armed
          (and through the brief confirm pulse), then eases back to nothing during cooldown. z-0 so the
          control's own content (children, below) always paints above it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0"
        style={{ height: `${fillProgress * 100}%`, background: "var(--fill, var(--chat-fill-neutral))", transition: `height ${fillDurationMs}ms ${cooling ? "ease-out" : "linear"}` }}
      />
      <div className="relative z-[1] h-full w-full">{children}</div>
    </div>
  );
}

/** True for a moment after `flashKey` changes (an action executed on this target) — drives the one-shot confirm pulse. */
function useConfirmPulse(flashKey: number | undefined) {
  const [seen, setSeen] = useState(flashKey);
  const [pulsing, setPulsing] = useState(false);
  if (seen !== flashKey) {
    setSeen(flashKey);
    setPulsing(!!flashKey);
  }
  useEffect(() => {
    if (!pulsing) return;
    const t = setTimeout(() => setPulsing(false), 260);
    return () => clearTimeout(t);
  }, [pulsing]);
  return pulsing;
}
