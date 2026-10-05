"use client";

import dynamic from "next/dynamic";
import { BigScreenNotice, useSmallScreen } from "@/components/BigScreenOnly";

// The lab uses webcam + wasm + canvas: client-only.
const InputLab = dynamic(() => import("@/components/InputLab"), {
  ssr: false,
  loading: () => <div className="p-6 font-mono text-sm text-lab-dim">Loading Input Lab…</div>,
});

export default function Page() {
  const small = useSmallScreen();
  if (small) return <BigScreenNotice />;
  return small === false ? <InputLab /> : null;
}
