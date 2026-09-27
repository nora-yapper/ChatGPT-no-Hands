"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Panel, Btn, ConfidenceBar } from "@/components/ui";
import { pipeline } from "@/pipeline/Pipeline";
import { settingsStore, useSettings } from "@/store/settingsStore";
import type { InputEvent } from "@/events/types";

const wallOffset = typeof performance !== "undefined" ? Date.now() - performance.now() : 0;
const clock = (t: number) => {
  const d = new Date(t + wallOffset);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

const TYPE_COLOR: Partial<Record<InputEvent["type"], string>> = {
  EXECUTE: "text-lab-ok",
  CONFIRM: "text-lab-confirm",
  CANCEL: "text-lab-warn",
  LONG_BLINK: "text-lab-confirm",
  NOD: "text-lab-confirm",
  HEAD_SHAKE: "text-lab-warn",
  GAZE_HOLD: "text-lab-armed",
  TRACKING_LOST: "text-lab-bad",
  FALSE_POSITIVE: "text-lab-bad",
  STATE_CHANGE: "text-lab-dim",
  SYSTEM: "text-lab-dim",
};

function metaString(m: Record<string, unknown> | undefined) {
  if (!m) return "";
  return Object.entries(m)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(3)) : String(v)}`)
    .join("  ");
}

export function EventLog() {
  const settings = useSettings();
  const [paused, setPaused] = useState(false);
  const [showState, setShowState] = useState(false);
  const [frozen, setFrozen] = useState<InputEvent[]>([]);
  const version = useSyncExternalStore(
    useCallback((cb: () => void) => pipeline.bus.onChange(cb), []),
    () => pipeline.bus.getVersion(),
    () => 0,
  );
  const live = useMemo(() => [...pipeline.bus.getEvents()].reverse(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = (paused ? frozen : live).filter((e) => showState || e.type !== "STATE_CHANGE").slice(0, 300);

  const exportJSON = () => {
    const blob = new Blob([pipeline.bus.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `input-lab-events-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title={`EVENT LOG · ${live.length}`}
      className="h-full"
      right={
        <>
          <Btn active={showState} onClick={() => setShowState(!showState)}>STATE CHANGES</Btn>
          <Btn active={paused} onClick={() => { if (!paused) setFrozen(live); setPaused(!paused); }}>{paused ? "RESUME" : "PAUSE"}</Btn>
          <Btn onClick={() => pipeline.bus.clear()}>CLEAR</Btn>
          <Btn onClick={exportJSON}>EXPORT JSON</Btn>
          <label className="flex items-center gap-1 font-mono text-[10px] text-lab-dim">
            max
            <input type="number" min={50} max={5000} step={50} value={settings.maxEvents} onChange={(e) => settingsStore.set({ maxEvents: Number(e.target.value) || 500 })} className="w-16 rounded border border-lab-border bg-lab-panel-2 px-1 text-lab-fg" />
          </label>
        </>
      }
    >
      <div className="font-mono text-[11px]">
        {events.length === 0 && <div className="text-lab-dim">No events yet.</div>}
        {events.map((e) => (
          <div key={e.id} className={`grid grid-cols-[92px_130px_1fr_auto] items-start gap-x-3 border-b border-lab-border/40 py-0.5 ${e.metadata?.falsePositive ? "bg-lab-bad/10" : ""}`}>
            <span className="tabular-nums text-lab-dim">{clock(e.timestamp)}</span>
            <span className={`font-semibold ${TYPE_COLOR[e.type] ?? "text-lab-fg"}`}>
              {e.type}
              {e.metadata?.falsePositive ? <span className="ml-1 rounded bg-lab-bad px-1 text-[8px] text-black">FALSE+</span> : null}
            </span>
            <span className="break-all text-lab-dim">
              {e.duration !== undefined && <span className="mr-2 text-lab-fg">{Math.round(e.duration)} ms</span>}
              {metaString(e.metadata)}
            </span>
            <span>{e.source !== "system" && e.type !== "STATE_CHANGE" && <ConfidenceBar value={e.confidence} />}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
