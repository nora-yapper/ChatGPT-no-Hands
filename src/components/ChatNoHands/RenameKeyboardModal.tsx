"use client";

import { useEffect, useRef } from "react";
import { Check, Delete, Eraser, X } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { pipeline } from "@/pipeline/Pipeline";
import type { FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ChatFocusable } from "./ChatFocusable";
import { TailText } from "./TailText";
import { TransitIndicator } from "./TransitIndicator";
import { useFocusArea } from "./useFocusArea";
import { useMeasuredGrid } from "./useMeasuredGrid";
import { BASE_SNAP, KEY_ROWS, RK_BACKSPACE, RK_CANCEL, RK_CLEAR, RK_SAVE, RK_SPACE, rkKeyTarget } from "./spatial";

/**
 * Renaming a Recents chat or project — and editing an Account field — all reuse the same on-screen
 * keyboard as the "Add to prompt" escape hatch, pre-loaded with the current value: every key, Clear,
 * Cancel and Save are head-selectable, so none of them ever require a physical keyboard. While open it
 * owns the head pointer / grid, exactly like KeyboardModal. `title` is the caller's own label for what's
 * being edited ("Rename chat", "Edit name", …) — this component doesn't need to know the specific cases.
 */
export function RenameKeyboardModal({ title, value, lastFlash, onActivate }: { title: string; value: string; lastFlash: Record<string, number>; onActivate: (t: FocusTarget) => void }) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  useFocusArea(areaRef, true);
  useMeasuredGrid(areaRef, true, "rename-keyboard", BASE_SNAP);
  useEffect(() => pipeline.recenterGrid(), []);

  const key = (t: FocusTarget, children: React.ReactNode, extra = "", variant: "secondary" | "ghost" | "default" | "outline" = "secondary") => (
    <ChatFocusable key={t.id} target={t} flashKey={lastFlash[t.id]} onActivate={onActivate} className="h-full">
      <Button variant={variant} className={cn("h-full w-full rounded-xl text-lg font-normal", extra)}>{children}</Button>
    </ChatFocusable>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="mx-4 w-full max-w-[820px] animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-3 rounded-2xl border border-border bg-card px-5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <TailText tail={value} className="mt-1 max-h-12 text-base leading-6" aria-live="polite">
            <span className="font-medium">{value}</span>
            <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] animate-pulse bg-foreground" aria-hidden />
          </TailText>
        </div>
        <div ref={areaRef} className="relative">
          <TransitIndicator />
          {/* cancel | keys | save */}
          <div className="grid gap-2" style={{ gridTemplateColumns: "3fr 15fr 3fr" }}>
            <ChatFocusable target={RK_CANCEL} flashKey={lastFlash[RK_CANCEL.id]} onActivate={onActivate} className="h-full bg-muted" radius="rounded-2xl">
              <Button variant="ghost" className="h-full w-full flex-col gap-2 rounded-2xl text-[15px] font-normal text-muted-foreground hover:bg-accent">
                <X className="size-6" /> Cancel
              </Button>
            </ChatFocusable>
            <div className="rounded-[24px] border border-border bg-card p-3 shadow-[0_8px_32px_rgba(0,0,0,0.16)]">
              <div className="grid gap-2" style={{ gridTemplateRows: "repeat(4, 52px)" }}>
                {KEY_ROWS.map((row) => (
                  <div key={row} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                    {row.split("").map((c) => key(rkKeyTarget(c), c))}
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_1fr_1fr_3fr] gap-2">
                  {key(RK_CLEAR, <><Eraser className="size-5" /> Clear</>, "gap-2 text-[15px]", "ghost")}
                  {key(RK_BACKSPACE, <><Delete className="size-5" /> Delete</>, "gap-2 text-[15px]")}
                  {/* its own key rather than folded into a letter row — the one character an email needs that the row above has no room for */}
                  {key(rkKeyTarget("@"), "@")}
                  {key(RK_SPACE, "space", "text-[15px] text-muted-foreground")}
                </div>
              </div>
            </div>
            <ChatFocusable target={RK_SAVE} flashKey={lastFlash[RK_SAVE.id]} onActivate={onActivate} className="h-full" radius="rounded-2xl">
              <Button className="h-full w-full flex-col gap-2 rounded-2xl text-[15px] font-normal">
                <Check className="size-6" strokeWidth={2.5} /> Save
              </Button>
            </ChatFocusable>
          </div>
        </div>
      </div>
    </div>
  );
}
