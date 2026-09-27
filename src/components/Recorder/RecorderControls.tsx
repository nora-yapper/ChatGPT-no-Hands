"use client";

import { useRef } from "react";
import { Btn } from "@/components/ui";
import { useLab } from "@/store/labStore";
import { pipeline } from "@/pipeline/Pipeline";
import type { Recording } from "@/pipeline/recorder";

export function RecorderControls() {
  const lab = useLab();
  const r = lab.recorder;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const exportRec = () => {
    const blob = new Blob([JSON.stringify(pipeline.recorder.toJSON())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `input-lab-signals-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importRec = async (file: File) => {
    try {
      const rec = JSON.parse(await file.text()) as Recording;
      if (rec.version !== 1 || !Array.isArray(rec.frames)) throw new Error("not a recording");
      pipeline.loadRecording(rec);
    } catch (e) {
      alert(`Could not load recording: ${String(e)}`);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] text-lab-dim">SIGNAL RECORDER</span>
      {!r.recording ? (
        <Btn onClick={() => pipeline.startRecording()} disabled={r.replaying || lab.tracking.status !== "running"}>● START RECORDING</Btn>
      ) : (
        <Btn variant="danger" onClick={() => pipeline.stopRecording()}>■ STOP</Btn>
      )}
      {!r.replaying ? (
        <Btn onClick={() => pipeline.startReplay()} disabled={r.recording || r.frames === 0}>▶ REPLAY</Btn>
      ) : (
        <Btn variant="primary" onClick={() => pipeline.stopReplay()}>■ STOP REPLAY {r.replayIndex}/{r.frames}</Btn>
      )}
      <Btn onClick={exportRec} disabled={r.frames === 0}>EXPORT</Btn>
      <Btn onClick={() => fileRef.current?.click()}>IMPORT</Btn>
      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importRec(f); e.target.value = ""; }} />
      <span className="font-mono text-[10px] tabular-nums text-lab-dim">{r.frames} frames{r.recording ? " · recording" : ""}</span>
    </div>
  );
}
