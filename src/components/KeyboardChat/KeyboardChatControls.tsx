"use client";

import { useMemo, useRef } from "react";
import { ArrowUp, ChevronDown, ChevronUp, Delete, SquarePen } from "lucide-react";
import type { FocusTarget } from "@/types/interaction";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import { ChatFocusable } from "@/components/ChatNoHands/ChatFocusable";
import { TransitIndicator } from "@/components/ChatNoHands/TransitIndicator";
import { useFocusArea } from "@/components/ChatNoHands/useFocusArea";
import { useMeasuredGrid } from "@/components/ChatNoHands/useMeasuredGrid";

export const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM?.,"];
export const SUGGESTIONS = ["Explain this simply", "Help me write an email", "Give me three ideas"];

const key = (ch: string): FocusTarget => ({ id: `key-${ch}`, kind: "key", label: ch, action: "TYPE", payload: { char: ch.toLowerCase() } });

const ACTIONS: FocusTarget[] = [
  { id: "btn-scroll-up", kind: "button", label: "Scroll up", action: "SCROLL_UP" },
  { id: "btn-scroll-down", kind: "button", label: "Scroll down", action: "SCROLL_DOWN" },
  { id: "key-backspace", kind: "key", label: "Backspace", action: "BACKSPACE" },
  { id: "key-space", kind: "key", label: "Space", action: "SPACE" },
  { id: "btn-new-chat", kind: "button", label: "New chat", action: "NEW_CHAT" },
  { id: "btn-send", kind: "button", label: "Send", action: "SEND" },
];

/**
 * The first hands-free chat design: a permanent on-screen keyboard under the composer, with suggestion
 * chips and an action row. Kept as an alternative to the spatial prediction interface for comparison.
 */
export function KeyboardChatControls({ lastFlash, canSend, hasMessages, onActivate }: { lastFlash: Record<string, number>; canSend: boolean; hasMessages: boolean; onActivate: (t: FocusTarget) => void }) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  useFocusArea(areaRef, true);
  useMeasuredGrid(areaRef, true, `${canSend}|${hasMessages}`);

  const rows = useMemo<FocusTarget[][]>(() => {
    const suggestions = SUGGESTIONS.map((s, i) => ({ id: `prompt-${i}`, kind: "card" as const, label: s, action: "PROMPT", payload: { text: s } }));
    return [suggestions, ...KEY_ROWS.map((r) => r.split("").map(key)), ACTIONS];
  }, []);

  const cell = "h-11 w-full text-[15px] font-normal";
  const render = (t: FocusTarget) => {
    const wrap = (child: React.ReactNode, radius = "rounded-xl", enabled = true) => (
      <ChatFocusable key={t.id} target={t} enabled={enabled} flashKey={lastFlash[t.id]} radius={radius} onActivate={onActivate}>{child}</ChatFocusable>
    );
    switch (t.action) {
      case "PROMPT": return wrap(<Button variant="outline" className={cn(cell, "rounded-full border-border bg-background hover:bg-muted dark:bg-transparent")}>{t.label}</Button>, "rounded-full");
      case "TYPE": return wrap(<Button variant="secondary" className={cn(cell, "rounded-xl text-base")}>{t.label.toLowerCase()}</Button>);
      case "SEND": return wrap(<Button disabled={!canSend} className={cn(cell, "rounded-xl gap-2 disabled:opacity-30")}><ArrowUp className="size-5" strokeWidth={2.5} /> Send</Button>, "rounded-xl", canSend);
      case "NEW_CHAT": return wrap(<Button variant="ghost" disabled={!hasMessages} className={cn(cell, "rounded-xl gap-2 text-muted-foreground disabled:opacity-30")}><SquarePen className="size-[18px]" /> New chat</Button>, "rounded-xl", hasMessages);
      case "BACKSPACE": return wrap(<Button variant="secondary" className={cn(cell, "rounded-xl gap-2")}><Delete className="size-[18px]" /> Delete</Button>);
      case "SPACE": return wrap(<Button variant="secondary" className={cn(cell, "rounded-xl text-muted-foreground")}>space</Button>);
      case "SCROLL_UP": return wrap(<Button variant="ghost" className={cn(cell, "rounded-xl gap-1.5 text-muted-foreground")}><ChevronUp className="size-[18px]" /> Up</Button>);
      case "SCROLL_DOWN": return wrap(<Button variant="ghost" className={cn(cell, "rounded-xl gap-1.5 text-muted-foreground")}><ChevronDown className="size-[18px]" /> Down</Button>);
      default: return null;
    }
  };

  return (
    <div ref={areaRef} className="relative">
      <TransitIndicator />
      <div className="grid gap-2">
        {rows.map((row, ri) => (
          <div key={ri} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>{row.map(render)}</div>
        ))}
      </div>
    </div>
  );
}
