"use client";

import dynamic from "next/dynamic";

const KeyboardChat = dynamic(() => import("@/components/KeyboardChat/KeyboardChat"), {
  ssr: false,
  loading: () => <div className="p-6 font-mono text-sm text-lab-dim">Loading Keyboard Chat…</div>,
});

export default function KeyboardChatPage() {
  return <KeyboardChat />;
}
