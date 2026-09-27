"use client";

import { Btn, Dot } from "@/components/ui";
import { useLab } from "@/store/labStore";
import { settingsStore, useSettings } from "@/store/settingsStore";
import { InterfaceSwitcher } from "./InterfaceSwitcher";

export function Header({ settingsOpen, onToggleSettings }: { settingsOpen: boolean; onToggleSettings: () => void }) {
  const lab = useLab();
  const settings = useSettings();
  return (
    <header className="flex items-center justify-between border-b border-lab-border px-4 py-2">
      <div className="flex items-center gap-4">
        <h1 className="font-mono text-base font-bold tracking-[0.3em]">INPUT LAB</h1>
        <InterfaceSwitcher />
      </div>
      <div className="flex items-center gap-4">
        <span className="rounded border border-lab-ok/40 px-1.5 py-0.5 font-mono text-[10px] text-lab-ok">Camera processing: LOCAL</span>
        <Dot on={lab.camera.status === "active"} label="CAMERA" />
        <Dot on={lab.tracking.status === "running" && lab.quality.faceDetected} color={lab.interaction.state === "TRACKING_LOST" ? "bad" : "ok"} label="TRACKING" />
        <span className="font-mono text-[10px] text-lab-dim">{lab.tracking.providerName || "no provider"}</span>
        <Btn active={settings.experimentMode} onClick={() => settingsStore.set({ experimentMode: !settings.experimentMode })}>EXPERIMENT MODE</Btn>
        <Btn active={settingsOpen} onClick={onToggleSettings}>SETTINGS</Btn>
      </div>
    </header>
  );
}
