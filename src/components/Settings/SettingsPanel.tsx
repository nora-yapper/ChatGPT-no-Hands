"use client";

import { Label, Btn } from "@/components/ui";
import { settingsStore, useSettings } from "@/store/settingsStore";
import { pipeline } from "@/pipeline/Pipeline";
import { THRESHOLD_META, type Thresholds, type Smoothing } from "@/config/thresholds";
import { GESTURE_EVENT_TYPES } from "@/events/types";
import { ACTION_INTENTS } from "@/types/interaction";
import { SCROLL_TOGGLE_GESTURES } from "@/gestures/scrollToggleDetector";

const SCROLL_TOGGLE_LABELS: Record<(typeof SCROLL_TOGGLE_GESTURES)[number], string> = {
  BROW_RAISE_BOTH: "RAISE BOTH BROWS",
  MOUTH_HOLD: "OPEN MOUTH (HOLD)",
  BLINK_BURST: "TRIPLE FAST BLINK",
};

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="mb-1.5 block">
      <div className="flex justify-between text-[11px]">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-lab-accent">{Number.isInteger(step) ? value : value.toFixed(2)}{unit ? ` ${unit}` : ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

export function SettingsPanel() {
  const s = useSettings();
  const groups = [...new Set(THRESHOLD_META.map((m) => m.group))];
  const smoothingMeta: Array<{ key: keyof Smoothing; label: string; min: number; max: number }> = [
    { key: "head", label: "Head movement (EMA α)", min: 0.02, max: 1 },
    { key: "pointer", label: "Eye direction / pointer (EMA α)", min: 0.02, max: 1 },
    { key: "face", label: "Facial signals (EMA α)", min: 0.02, max: 1 },
    { key: "deadZone", label: "Dead zone (head axes)", min: 0, max: 0.3 },
  ];

  return (
    <div className="text-xs">
      <div className="flex gap-2">
        <Btn variant="danger" onClick={() => settingsStore.resetToDefaults()}>RESET TO DEFAULTS</Btn>
        <Btn onClick={() => settingsStore.set({ calibration: null })} disabled={!s.calibration}>CLEAR CALIBRATION</Btn>
      </div>

      <Label>FOCUS MODE</Label>
      <div className="flex gap-1.5">
        <Btn active={s.focusMode === "pointer"} onClick={() => settingsStore.set({ focusMode: "pointer" })}>HEAD POINTER</Btn>
        <Btn active={s.focusMode === "discrete"} onClick={() => settingsStore.set({ focusMode: "discrete" })}>DISCRETE STEPS</Btn>
        <Btn active={s.focusMode === "grid"} onClick={() => settingsStore.set({ focusMode: "grid" })}>GRID GLIDE</Btn>
      </div>
      {s.focusMode === "grid" && (
        <>
          <div className="mt-1 flex gap-1.5">
            <Btn active={s.thresholds.gridInput === "relative"} onClick={() => settingsStore.setThreshold("gridInput", "relative")} title="Mouse-like: head movement deltas move the cursor (sensitivity, acceleration, dead zone)">RELATIVE (MOUSE)</Btn>
            <Btn active={s.thresholds.gridInput === "absolute"} onClick={() => settingsStore.setThreshold("gridInput", "absolute")} title="Head angle maps directly to the cursor position">ABSOLUTE</Btn>
            <Btn onClick={() => pipeline.recenterGrid()} title="Move the grid cursor back to the centre (also happens on calibration)">RECENTER</Btn>
          </div>
          <div className="mt-1 font-mono text-[9px] text-lab-dim">Every card, button and key is one grid field. Glide the cursor across fields; a field only becomes the focus once the cursor stops on it. Tune under GRID GLIDE below.</div>
        </>
      )}
      <div className="mt-1 flex gap-1.5">
        <Btn active={s.thresholds.invertYaw} onClick={() => settingsStore.setThreshold("invertYaw", !s.thresholds.invertYaw)}>INVERT YAW</Btn>
        <Btn active={s.thresholds.invertPitch} onClick={() => settingsStore.setThreshold("invertPitch", !s.thresholds.invertPitch)}>INVERT PITCH</Btn>
      </div>

      <Label>HEAD SCROLL TOGGLE</Label>
      <div className="flex gap-1.5">
        {SCROLL_TOGGLE_GESTURES.map((g) => (
          <Btn key={g} active={s.scrollToggleGesture === g} onClick={() => settingsStore.set({ scrollToggleGesture: g })}>{SCROLL_TOGGLE_LABELS[g]}</Btn>
        ))}
      </div>
      <div className="mt-1 font-mono text-[9px] text-lab-dim">Raise both brows or hold your mouth open for a beat to turn head-tilt scrolling on/off. Tune the exact thresholds under HEAD SCROLL below.</div>

      <Label>GESTURE → INTENT BINDINGS</Label>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        {GESTURE_EVENT_TYPES.map((g) => (
          <div key={g} className="contents">
            <span className="font-mono text-[11px]">{g}</span>
            <select value={s.bindings[g]} onChange={(e) => settingsStore.setBinding(g, e.target.value as (typeof ACTION_INTENTS)[number])} className="rounded border border-lab-border bg-lab-panel-2 px-1 font-mono text-[11px] text-lab-fg">
              {ACTION_INTENTS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="mt-1 font-mono text-[9px] text-lab-dim">CONFIRM needs ARMED. ACTIVATE fires from FOCUSED (no hold). CANCEL drops focus/arm. OPEN_MENU is global.</div>

      <Label>SMOOTHING</Label>
      {smoothingMeta.map((m) => (
        <Slider key={m.key} label={m.label} value={s.smoothing[m.key]} min={m.min} max={m.max} step={0.01} onChange={(v) => settingsStore.setSmoothing(m.key, v)} />
      ))}

      {groups.map((g) => (
        <div key={g}>
          <Label>{g.toUpperCase()}</Label>
          {THRESHOLD_META.filter((m) => m.group === g).map((m) => (
            <Slider key={m.key} label={m.label} value={s.thresholds[m.key] as number} min={m.min} max={m.max} step={m.step} unit={m.unit} onChange={(v) => settingsStore.setThreshold(m.key as keyof Thresholds, v as never)} />
          ))}
        </div>
      ))}
    </div>
  );
}
