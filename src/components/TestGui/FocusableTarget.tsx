"use client";

import type { ReactNode } from "react";
import { useLab } from "@/store/labStore";
import type { FocusTarget } from "@/types/interaction";
import { useFocusable } from "./useFocusable";

export function FocusableTarget({ target, children, className = "", flashKey }: { target: FocusTarget; children: ReactNode; className?: string; flashKey?: number }) {
  const ref = useFocusable<HTMLDivElement>(target);
  const lab = useLab();
  const focused = lab.focusId === target.id;
  const armed = lab.interaction.armedTarget?.id === target.id && (lab.interaction.state === "ARMED" || lab.interaction.state === "CONFIRMING");
  const confirming = armed && lab.interaction.state === "CONFIRMING";
  const executed = lab.interaction.lastAction?.target?.id === target.id && (lab.interaction.state === "EXECUTING" || lab.interaction.state === "COOLDOWN");
  const holdProgress = focused && lab.gaze?.targetId === target.id ? lab.gaze.progress : 0;

  const ring = confirming
    ? "border-lab-confirm ring-2 ring-lab-confirm/60"
    : armed
      ? "border-lab-armed ring-2 ring-lab-armed/50 lab-pulse"
      : executed
        ? "border-lab-ok"
        : focused
          ? "border-lab-accent ring-1 ring-lab-accent/50"
          : "border-lab-border";

  return (
    <div ref={ref} data-target={target.id} className={`relative select-none overflow-hidden rounded border-2 bg-lab-panel-2 transition-colors ${ring} ${className}`}>
      {!!flashKey && <div key={flashKey} className="lab-flash pointer-events-none absolute inset-0" />}
      {children}
      {focused && !armed && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-lab-border/60">
          <div className="h-full bg-lab-armed" style={{ width: `${holdProgress * 100}%` }} />
        </div>
      )}
      {(focused || armed) && (
        <div className={`absolute right-1 top-1 rounded px-1 font-mono text-[8px] tracking-wider ${armed ? "bg-lab-armed text-black" : "bg-lab-accent/80 text-black"}`}>
          {confirming ? "CONFIRM" : armed ? "ARMED" : "FOCUS"}
        </div>
      )}
    </div>
  );
}
