"use client";

import { Panel, Btn, Label, SignalRow, fmt, fmtSigned, fmtMs } from "@/components/ui";
import { useLab } from "@/store/labStore";
import { settingsStore, useSettings } from "@/store/settingsStore";
import { pipeline } from "@/pipeline/Pipeline";
import { ALL_BLENDSHAPES } from "@/config/blendshapeMap";

export function SignalPanel() {
  const lab = useLab();
  const settings = useSettings();
  const th = settings.thresholds;
  const s = settings.showRaw ? lab.raw : lab.smoothed;
  const gaze = lab.gaze;
  const target = pipeline.focus.getTarget(lab.focusId);

  return (
    <Panel
      title="SIGNALS"
      right={
        <>
          <Btn active={settings.showRaw} onClick={() => settingsStore.set({ showRaw: true })}>RAW</Btn>
          <Btn active={!settings.showRaw} onClick={() => settingsStore.set({ showRaw: false })}>SMOOTHED</Btn>
        </>
      }
    >
      {!s.tracking && <div className="mb-2 font-mono text-[10px] text-lab-warn">No tracking — values are neutral.</div>}

      <Label>HEAD</Label>
      <div className="grid grid-cols-2 gap-x-3">
        <SignalRow label="X position" value={s.headX} />
        <SignalRow label="Y position" value={s.headY} />
      </div>
      <SignalRow label="Yaw" value={s.headYaw} bipolar left="LEFT" right="RIGHT" threshold={th.shakeThreshold} />
      <SignalRow label="Pitch" value={s.headPitch} bipolar left="DOWN" right="UP" threshold={-th.nodThreshold} />
      <SignalRow label="Roll" value={s.headRoll} bipolar left="L" right="R" />
      {settings.experimentMode && (
        <div className="font-mono text-[10px] text-lab-dim">
          deg: yaw {fmtSigned(s.headYawDeg, 1)} pitch {fmtSigned(s.headPitchDeg, 1)} roll {fmtSigned(s.headRollDeg, 1)} · source: {s.headPoseFromMatrix ? "transform matrix" : "landmark geometry"}
          {settings.calibration && ` · baseline yaw ${fmtSigned(settings.calibration.headYawDeg, 1)} pitch ${fmtSigned(settings.calibration.headPitchDeg, 1)}`}
        </div>
      )}

      <Label>EYES</Label>
      <div className="grid grid-cols-2 gap-x-3">
        <div>
          <div className="mb-0.5 font-mono text-[10px] text-lab-dim">LEFT EYE</div>
          <SignalRow label="Openness" value={s.leftEyeOpenness} threshold={th.eyeClosedThreshold} />
          <SignalRow label="Blink" value={s.leftBlink} />
          <SignalRow label="Squint" value={s.leftSquint} />
        </div>
        <div>
          <div className="mb-0.5 font-mono text-[10px] text-lab-dim">RIGHT EYE</div>
          <SignalRow label="Openness" value={s.rightEyeOpenness} threshold={th.eyeClosedThreshold} />
          <SignalRow label="Blink" value={s.rightBlink} />
          <SignalRow label="Squint" value={s.rightSquint} />
        </div>
      </div>
      <div className="mb-0.5 font-mono text-[10px] text-lab-dim">EYE DIRECTION (relative to head, from blendshapes)</div>
      <SignalRow label="Eye X" value={s.eyeX} bipolar left="LEFT" right="RIGHT" />
      <SignalRow label="Eye Y" value={s.eyeY} bipolar left="DOWN" right="UP" />

      <Label>GAZE ESTIMATION</Label>
      <div className="mb-1 rounded border border-lab-warn/40 bg-lab-warn/5 px-2 py-1 font-mono text-[10px] text-lab-warn">
        Screen-space gaze: UNAVAILABLE / EXPERIMENTAL. The pointer below is a{" "}
        <b>{s.pointerSource === "head" ? "HEAD POINTER" : "HEAD+EYE BLEND"}</b>
        {settings.focusMode === "discrete" && " (focus mode: DISCRETE steps)"}
        {settings.focusMode === "grid" && " (focus mode: GRID glide — snapped to cells)"}.
      </div>
      <div className="grid grid-cols-2 gap-x-3">
        <SignalRow label="Pointer X" value={s.pointerX} />
        <SignalRow label="Pointer Y" value={s.pointerY} />
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
        <div>
          <div className="text-[10px] text-lab-dim">Target</div>
          <div className="truncate text-lab-accent">{target?.label ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] text-lab-dim">Dwell</div>
          <div className="tabular-nums">{gaze?.targetId ? fmtMs(gaze.dwellMs) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] text-lab-dim">Stability</div>
          <div className="tabular-nums">{gaze?.targetId ? fmt(gaze.stability, 2) : "—"}</div>
        </div>
      </div>

      <Label>FACE</Label>
      <SignalRow label="Mouth openness" value={s.mouthOpenness} threshold={th.mouthOpenThreshold} />
      <div className="grid grid-cols-2 gap-x-3">
        <SignalRow label="Brow raise L" value={s.leftBrowRaise} threshold={th.browRaiseThreshold} />
        <SignalRow label="Brow raise R" value={s.rightBrowRaise} threshold={th.browRaiseThreshold} />
        <SignalRow label="Brow furrow" value={s.browFurrow} />
        <SignalRow label="Smile" value={s.smile} />
      </div>

      {settings.experimentMode && lab.frame && (
        <>
          <Label>RAW BLENDSHAPES (provider output)</Label>
          <div className="grid grid-cols-2 gap-x-3 font-mono text-[10px] tabular-nums">
            {ALL_BLENDSHAPES.map((name) => {
              const v = lab.frame?.blendshapes[name] ?? 0;
              return (
                <div key={name} className="flex items-center gap-1">
                  <span className="w-28 truncate text-lab-dim">{name}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-sm bg-lab-border/60">
                    <div className="h-full bg-lab-accent/70" style={{ width: `${v * 100}%` }} />
                  </div>
                  <span className="w-8 text-right">{v.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}
