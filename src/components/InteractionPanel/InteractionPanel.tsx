"use client";

import { Panel, ConfidenceBar, fmtMs, Bar } from "@/components/ui";
import { useLab } from "@/store/labStore";
import { useSettings } from "@/store/settingsStore";
import type { InteractionState } from "@/types/interaction";

const LADDER: Array<{ label: string; states: InteractionState[] }> = [
  { label: "LOOK", states: ["NAVIGATING", "FOCUSED", "ARMED", "CONFIRMING", "EXECUTING", "COOLDOWN"] },
  { label: "FOCUS", states: ["FOCUSED", "ARMED", "CONFIRMING", "EXECUTING", "COOLDOWN"] },
  { label: "HOLD", states: ["ARMED", "CONFIRMING", "EXECUTING", "COOLDOWN"] },
  { label: "ARM", states: ["ARMED", "CONFIRMING", "EXECUTING", "COOLDOWN"] },
  { label: "CONFIRM", states: ["CONFIRMING", "EXECUTING", "COOLDOWN"] },
  { label: "ACTION", states: ["EXECUTING", "COOLDOWN"] },
];

const STATE_COLOR: Record<InteractionState, string> = {
  IDLE: "text-lab-dim border-lab-border",
  NAVIGATING: "text-lab-fg border-lab-dim",
  FOCUSED: "text-lab-accent border-lab-accent",
  ARMED: "text-lab-armed border-lab-armed",
  CONFIRMING: "text-lab-confirm border-lab-confirm",
  EXECUTING: "text-lab-ok border-lab-ok",
  COOLDOWN: "text-lab-dim border-lab-dim",
  TRACKING_LOST: "text-lab-bad border-lab-bad",
};

export function InteractionPanel() {
  const lab = useLab();
  const settings = useSettings();
  const it = lab.interaction;
  const gaze = lab.gaze;
  const focusTarget = it.focusTarget;
  const last = it.lastAction;
  const sinceMs = Math.max(0, lab.now - it.since);

  return (
    <Panel title="INTERACTION STATE" className="max-h-[60%] shrink-0">
      <div className={`rounded border-2 px-3 py-1 text-center font-mono text-base font-bold tracking-[0.2em] ${STATE_COLOR[it.state]} ${it.state === "ARMED" ? "lab-pulse" : ""}`}>
        {it.state}
      </div>
      <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] text-lab-dim">
        <span className="truncate">{it.lastTransitionReason}</span>
        <span className="tabular-nums">{fmtMs(sinceMs)}</span>
      </div>

      <div className="mt-2 flex items-stretch gap-1">
        {LADDER.map((step, i) => {
          const on = step.states.includes(it.state);
          const holdProgress = step.label === "HOLD" && !on && gaze?.targetId ? gaze.progress : on ? 1 : 0;
          return (
            <div key={step.label} className="flex flex-1 flex-col items-center">
              <div className={`w-full rounded-sm border px-1 py-1 text-center font-mono text-[9px] tracking-wider ${on ? "border-lab-accent bg-lab-accent/15 text-lab-accent" : "border-lab-border text-lab-dim"}`}>{step.label}</div>
              <div className="mt-1 w-full">
                <Bar value={holdProgress} color={on ? "accent" : "armed"} height={3} />
              </div>
              {i < LADDER.length - 1 && <span className="sr-only">→</span>}
            </div>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[10px]">
        <div className="text-lab-dim">focus</div>
        <div className="truncate text-lab-accent">{focusTarget?.label ?? "—"}</div>
        <div className="text-lab-dim">dwell</div>
        <div className="tabular-nums">{gaze?.targetId ? `${fmtMs(gaze.dwellMs)} / ${settings.thresholds.gazeHoldMs}` : "—"}</div>
        <div className="text-lab-dim">armed</div>
        <div className="truncate text-lab-armed">{it.armedTarget?.label ?? "—"}</div>
        <div className="text-lab-dim">cooldown</div>
        <div className="tabular-nums">{it.state === "COOLDOWN" ? fmtMs(it.cooldownRemainingMs) : "—"}</div>
        <div className="text-lab-dim">mode</div>
        <div className="col-span-3">{settings.focusMode === "pointer" ? "head pointer" : settings.focusMode === "grid" ? "grid glide" : "discrete steps"}</div>
      </div>

      <div className="mt-1.5 truncate font-mono text-[10px] text-lab-dim">
        <span className="mr-2 tracking-[0.18em]">BINDINGS</span>
        {Object.entries(settings.bindings)
          .filter(([, v]) => v !== "NONE")
          .map(([g, v]) => (
            <span key={g} className="mr-2 inline-block">
              <span className="text-lab-fg">{g}</span>→{v}
            </span>
          ))}
      </div>

      {last && (
        <div className="mt-1.5 rounded border border-lab-ok/40 bg-lab-ok/5 px-2 py-1 font-mono text-[10px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-lab-ok">{last.action}</span>
            <span className="truncate text-lab-dim">{last.target?.label ?? "global"} ← {last.reason.triggerEvent}{last.reason.triggerDuration !== undefined ? ` ${fmtMs(last.reason.triggerDuration)}` : ""}{last.reason.thresholdName ? ` · ${last.reason.thresholdName}=${last.reason.thresholdValue ?? "?"}` : ""}{last.reason.dwellMs !== undefined ? ` · dwell ${fmtMs(last.reason.dwellMs)}` : ""}</span>
            <ConfidenceBar value={last.reason.triggerConfidence} />
          </div>
        </div>
      )}
    </Panel>
  );
}
