"use client";

import dynamic from "next/dynamic";

// Webcam + wasm + canvas: client-only, like the lab.
const ChatNoHands = dynamic(() => import("@/components/ChatNoHands/ChatNoHands"), {
  ssr: false,
  loading: () => <div className="p-6 font-mono text-sm text-lab-dim">Loading ISNT…</div>,
});

export default function ChatPage() {
  return <ChatNoHands />;
}
