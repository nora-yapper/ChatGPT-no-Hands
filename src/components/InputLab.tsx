"use client";

import { useEffect, useState } from "react";
import { Header } from "./layout/Header";
import { CameraPanel } from "./CameraPanel/CameraPanel";
import { SignalPanel } from "./SignalPanel/SignalPanel";
import { GesturePanel } from "./GesturePanel/GesturePanel";
import { InteractionPanel } from "./InteractionPanel/InteractionPanel";
import { TestGui } from "./TestGui/TestGui";
import { EventLog } from "./EventLog/EventLog";
import { CalibrationOverlay } from "./Calibration/CalibrationOverlay";
import { SettingsPanel } from "./Settings/SettingsPanel";
import { RecorderControls } from "./Recorder/RecorderControls";
import { Panel } from "./ui";
import { useCameraTracking } from "@/pipeline/useCameraTracking";
import { pipeline } from "@/pipeline/Pipeline";
import { settingsStore, useSettings } from "@/store/settingsStore";
import { labStore } from "@/store/labStore";

export default function InputLab() {
  const { videoRef, start, stop } = useCameraTracking();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useSettings();

  useEffect(() => {
    settingsStore.hydrate();
    // Debug handle for the browser console / automated experiments: window.__inputLab
    (window as unknown as { __inputLab: unknown }).__inputLab = { labStore, settingsStore, pipeline };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "f" || e.key === "F") pipeline.markFalsePositive();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header settingsOpen={settingsOpen} onToggleSettings={() => setSettingsOpen((o) => !o)} />
      <div className="flex min-h-0 flex-1">
        <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(120px,0.45fr)] gap-2 p-2">
          <div className="grid min-h-0 grid-cols-[minmax(280px,1fr)_minmax(300px,1.1fr)_minmax(280px,1fr)] gap-2">
            <CameraPanel videoRef={videoRef} onStart={start} onStop={stop} />
            <SignalPanel />
            <div className="flex min-h-0 flex-col gap-2">
              <InteractionPanel />
              {settings.experimentMode && (
                <Panel title="GESTURE DETECTORS" className="min-h-0 flex-1">
                  <GesturePanel />
                </Panel>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <TestGui />
            <div className="rounded border border-lab-border bg-lab-panel px-3 py-1">
              <RecorderControls />
            </div>
          </div>
          <EventLog />
        </main>
        {settingsOpen && (
          <aside className="w-80 shrink-0 overflow-auto border-l border-lab-border bg-lab-panel p-3">
            <div className="mb-2 font-mono text-[11px] font-semibold tracking-[0.18em] text-lab-dim">SETTINGS · live</div>
            <SettingsPanel />
          </aside>
        )}
      </div>
      <CalibrationOverlay />
    </div>
  );
}
