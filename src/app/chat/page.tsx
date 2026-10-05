"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LaunchScreen } from "@/components/ChatNoHands/LaunchScreen";

// Webcam + wasm + canvas: client-only, like the lab.
const loadChat = () => import("@/components/ChatNoHands/ChatNoHands");
const ChatNoHands = dynamic(loadChat, { ssr: false, loading: () => null });

export default function ChatPage() {
  const [ready, setReady] = useState(false);

  // the same import dynamic() uses, so this resolves when the chat's code has arrived
  useEffect(() => {
    let live = true;
    loadChat().then(() => live && setReady(true), () => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <ChatNoHands />
      <LaunchScreen ready={ready} />
    </>
  );
}
