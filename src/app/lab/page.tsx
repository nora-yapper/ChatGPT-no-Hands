"use client";

import dynamic from "next/dynamic";

// The lab uses webcam + wasm + canvas: client-only.
const InputLab = dynamic(() => import("@/components/InputLab"), {
  ssr: false,
  loading: () => <div className="p-6 font-mono text-sm text-lab-dim">Loading Input Lab…</div>,
});

export default function Page() {
  return <InputLab />;
}
