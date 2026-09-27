"use client";

import { Btn } from "@/components/ui";
import { useLab } from "@/store/labStore";
import { pipeline } from "@/pipeline/Pipeline";

export function CalibrationOverlay() {
  const lab = useLab();
  if (!lab.calibration.active) return null;
  const pct = Math.round(lab.calibration.progress * 100);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85">
      <div className="font-mono text-[11px] tracking-[0.3em] text-lab-dim">CALIBRATION</div>
      <div className="mt-2 text-lg">Look naturally at the centre of the screen and hold still.</div>
      <div className="my-10 flex h-16 w-16 items-center justify-center rounded-full border-2 border-lab-accent">
        <div className="h-3 w-3 rounded-full bg-lab-accent" />
      </div>
      <div className="w-72 overflow-hidden rounded bg-lab-border">
        <div className="h-3 bg-lab-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 font-mono text-sm tabular-nums">{pct}% · {lab.calibration.samples} samples</div>
      {!lab.quality.faceDetected && <div className="mt-2 font-mono text-[11px] text-lab-bad">Face not detected — calibration needs a tracked face.</div>}
      <div className="mt-6">
        <Btn onClick={() => pipeline.cancelCalibration()}>CANCEL</Btn>
      </div>
    </div>
  );
}
