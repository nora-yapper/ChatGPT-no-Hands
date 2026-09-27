"use client";

import { useEffect, useRef } from "react";
import { Check, Delete, X } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { pipeline } from "@/pipeline/Pipeline";
import type { FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ChatFocusable } from "./ChatFocusable";
import { TailText } from "./TailText";
import { TransitIndicator } from "./TransitIndicator";
import { useFocusArea } from "./useFocusArea";
import { useMeasuredGrid } from "./useMeasuredGrid";
import { BASE_SNAP, KB_BACKSPACE, KB_CANCEL, KB_CONFIRM, KB_SPACE, KEY_ROWS, keyTarget } from "./spatial";

/**
 * The escape hatch: a temporary on-screen keyboard for a word, phrase or sentence the predictions did
 * not offer. While open it owns the head pointer / grid; confirming appends the text to the prompt.
 * Layout: Cancel as a full-height column on the left, the keys in the middle, Add as a full-height
 * column on the right, directly beside the keys.
 */
export function KeyboardModal({ buffer, prompt, lastFlash, onActivate }: { buffer: string; prompt: string; lastFlash: Record<string, number>; onActivate: (t: FocusTarget) => void }) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  useFocusArea(areaRef, true);
  useMeasuredGrid(areaRef, true, "keyboard", BASE_SNAP);
  useEffect(() => pipeline.recenterGrid(), []);

  const key = (t: FocusTarget, children: React.ReactNode, extra = "", variant: "secondary" | "ghost" | "default" | "outline" = "secondary") => (
    <ChatFocusable key={t.id} target={t} flashKey={lastFlash[t.id]} onActivate={onActivate} className="h-full">
      <Button variant={variant} className={cn("h-full w-full rounded-xl text-lg font-normal", extra)}>{children}</Button>
    </ChatFocusable>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Keyboard" className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="mx-4 w-full max-w-[820px] animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-3 rounded-2xl border border-border bg-card px-5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="text-xs font-medium text-muted-foreground">Add to prompt</div>
          <TailText tail={prompt + buffer} className="mt-1 max-h-12 text-base leading-6" aria-live="polite">
            <span className="text-muted-foreground">{prompt}</span>
            {prompt && " "}
            <span className="font-medium">{buffer}</span>
            <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] animate-pulse bg-foreground" aria-hidden />
          </TailText>
        </div>
        <div ref={areaRef} className="relative">
          <TransitIndicator />
          {/* cancel | keys | add */}
          <div className="grid gap-2" style={{ gridTemplateColumns: "3fr 15fr 3fr" }}>
            <ChatFocusable target={KB_CANCEL} flashKey={lastFlash[KB_CANCEL.id]} onActivate={onActivate} className="h-full bg-muted" radius="rounded-2xl">
              <Button variant="ghost" className="h-full w-full flex-col gap-2 rounded-2xl text-[15px] font-normal text-muted-foreground hover:bg-accent">
                <X className="size-6" /> Cancel
              </Button>
            </ChatFocusable>
            <div className="rounded-[24px] border border-border bg-card p-3 shadow-[0_8px_32px_rgba(0,0,0,0.16)]">
              <div className="grid gap-2" style={{ gridTemplateRows: "repeat(4, 52px)" }}>
                {KEY_ROWS.map((row) => (
                  <div key={row} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                    {row.split("").map((c) => key(keyTarget(c), c))}
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_2fr] gap-2">
                  {key(KB_BACKSPACE, <><Delete className="size-5" /> Delete</>, "gap-2 text-[15px]")}
                  {key(KB_SPACE, "space", "text-[15px] text-muted-foreground")}
                </div>
              </div>
            </div>
            <ChatFocusable target={KB_CONFIRM} flashKey={lastFlash[KB_CONFIRM.id]} onActivate={onActivate} className="h-full" radius="rounded-2xl">
              <Button className="h-full w-full flex-col gap-2 rounded-2xl text-[15px] font-normal">
                <Check className="size-6" strokeWidth={2.5} /> Add
              </Button>
            </ChatFocusable>
          </div>
        </div>
      </div>
    </div>
  );
}
