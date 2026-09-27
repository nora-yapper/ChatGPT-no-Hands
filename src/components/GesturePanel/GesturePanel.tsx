"use client";

import { Bar, ConfidenceBar, fmtMs } from "@/components/ui";
import { useLab } from "@/store/labStore";
import type { DetectorStatus } from "@/gestures/Detector";

function DetectorRow({ d, color = "accent" }: { d: DetectorStatus; color?: "accent" | "armed" }) {
  return (
    <div className="border-b border-lab-border/60 py-1.5 last:border-0">
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${d.active ? "text-lab-fg" : "text-lab-dim"}`}>{d.name}</span>
        <span className="font-mono text-[10px] text-lab-dim">{d.phase}{d.durationMs > 0 ? ` · ${fmtMs(d.durationMs)}` : ""}</span>
      </div>
      <div className="my-1">
        <Bar value={d.progress} color={d.active ? color : "accent"} height={4} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[9px] text-lab-dim">
          {Object.entries(d.thresholds).map(([k, v]) => `${k}=${v}`).join(" ")}
        </span>
        {d.last && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
            <span className="text-lab-confirm">{d.last.type}</span>
            <ConfidenceBar value={d.last.confidence} />
          </span>
        )}
      </div>
    </div>
  );
}

export function GesturePanel() {
  const lab = useLab();
  const gaze = lab.gaze;
  return (
    <div>
      {gaze && (
        <DetectorRow
          color="armed"
          d={{ ...gaze, name: "gaze hold", phase: `${gaze.phase}${gaze.targetId ? ` · stability ${gaze.stability.toFixed(2)}` : ""}` }}
        />
      )}
      {lab.detectors.map((d) => (
        <DetectorRow key={d.name} d={d} />
      ))}
      {lab.detectors.length === 0 && <div className="font-mono text-[10px] text-lab-dim">Detectors idle — start the camera.</div>}
    </div>
  );
}
