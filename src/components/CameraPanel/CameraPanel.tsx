"use client";

import type { RefObject } from "react";
import { Panel, Btn, Dot, Bar, fmt } from "@/components/ui";
import { useLab } from "@/store/labStore";
import { settingsStore, useSettings } from "@/store/settingsStore";
import { pipeline } from "@/pipeline/Pipeline";
import type { QualityLevel } from "@/types/signals";
import { LandmarkOverlay } from "./LandmarkOverlay";

const qColor = (q: QualityLevel) => (q === "GOOD" ? "text-lab-ok" : q === "FAIR" ? "text-lab-warn" : q === "POOR" ? "text-lab-bad" : "text-lab-dim");

export function CameraPanel({ videoRef, onStart, onStop }: { videoRef: RefObject<HTMLVideoElement | null>; onStart: () => void; onStop: () => void }) {
  const lab = useLab();
  const settings = useSettings();
  const camOn = lab.camera.status === "active";
  const trackingOn = lab.tracking.status === "running" && lab.quality.faceDetected;
  const q = lab.quality;

  return (
    <Panel
      title="CAMERA"
      right={
        <>
          <Dot on={camOn} label="CAM" />
          <Dot on={trackingOn} color={lab.tracking.status === "paused" ? "warn" : "ok"} label="TRK" />
        </>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        {!camOn ? (
          <Btn variant="primary" onClick={onStart} disabled={lab.camera.status === "requesting"}>START CAMERA</Btn>
        ) : (
          <Btn onClick={onStop}>STOP</Btn>
        )}
        <Btn onClick={() => pipeline.startCalibration()} disabled={!trackingOn} title="Capture a neutral baseline (2 s)">
          {settings.calibration ? "RECALIBRATE" : "CALIBRATE"}
        </Btn>
        <Btn active={settings.showLandmarks} onClick={() => settingsStore.set({ showLandmarks: !settings.showLandmarks })}>LANDMARKS</Btn>
        <Btn active={settings.mirror} onClick={() => settingsStore.set({ mirror: !settings.mirror })}>MIRROR</Btn>
        <Btn active={lab.paused} onClick={() => pipeline.setPaused(!lab.paused)} disabled={!camOn}>{lab.paused ? "RESUME" : "PAUSE TRACKING"}</Btn>
      </div>
      <div className="relative mx-auto aspect-video max-w-full overflow-hidden rounded bg-black" style={{ height: "min(28vh, 240px)" }}>
        <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-contain" style={{ transform: settings.mirror ? "scaleX(-1)" : "none" }} />
        <LandmarkOverlay />
        {!camOn && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center font-mono text-[11px] text-lab-dim">
            {lab.camera.status === "requesting" ? "Requesting camera permission…" : lab.camera.message ?? "Camera off. Press START."}
          </div>
        )}
        {camOn && lab.tracking.status === "loading" && (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-center font-mono text-[10px] text-lab-warn">{lab.tracking.message}</div>
        )}
        {lab.tracking.status === "error" && (
          <div className="absolute inset-x-0 bottom-0 bg-lab-bad/80 p-1 text-center font-mono text-[10px] text-white">{lab.tracking.message}</div>
        )}
        {lab.paused && <div className="absolute left-2 top-2 rounded bg-lab-warn/90 px-1.5 font-mono text-[10px] text-black">PAUSED</div>}
      </div>

      {(lab.camera.status === "denied" || lab.camera.status === "error" || lab.camera.status === "unavailable") && (
        <div className="mt-2 rounded border border-lab-bad/50 bg-lab-bad/10 p-2 font-mono text-[11px] text-lab-bad">{lab.camera.message}</div>
      )}

      <div className="mt-2 grid grid-cols-3 gap-x-2 font-mono text-[11px] tabular-nums text-lab-dim">
        <div>
          TRACKING <span className={trackingOn ? "text-lab-ok" : "text-lab-dim"}>● {lab.tracking.status === "running" ? (q.faceDetected ? "ACTIVE" : "NO FACE") : lab.tracking.status.toUpperCase()}</span>
        </div>
        <div>
          FPS <span className="text-lab-fg">{lab.tracking.fps}</span> <span className="opacity-60">/ {fmt(lab.tracking.inferenceMs, 0)} ms</span>
        </div>
        <div>
          {lab.camera.width || "—"} × {lab.camera.height || "—"}
        </div>
      </div>


      <div className="mt-2 border-t border-lab-border pt-2">
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-lab-dim">
          <span>TRACKING QUALITY</span>
          <span className="tabular-nums">{Math.round(q.overall * 100)}%</span>
        </div>
        <Bar value={q.overall} color={q.overall > 0.7 ? "ok" : q.overall > 0.4 ? "armed" : "bad"} />
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 font-mono text-[10px]">
          {(
            [
              ["Face detected", q.faceDetected ? "GOOD" : "NONE"],
              ["Face size", q.faceSize],
              ["In frame", q.inFrame],
              ["Motion", q.motion],
              ["Latency", q.latency],
              ["Landmarks", q.landmarks],
              ["Head pose", q.headPose],
            ] as Array<[string, QualityLevel]>
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-lab-dim">{k}</span>
              <span className={qColor(v)}>{v === "GOOD" ? "● GOOD" : v}</span>
            </div>
          ))}
        </div>
        {q.issues.length > 0 && <div className="mt-1 font-mono text-[10px] text-lab-warn">{q.issues.join(" · ")}</div>}
        {!settings.calibration && camOn && <div className="mt-1 font-mono text-[10px] text-lab-warn">Not calibrated — signals use default baseline.</div>}
      </div>
    </Panel>
  );
}
