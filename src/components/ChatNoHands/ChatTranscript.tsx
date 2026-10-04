"use client";

import { forwardRef } from "react";
import type { ChatMessage } from "@/chat/assistant";

export const ChatTranscript = forwardRef<HTMLDivElement, { messages: ChatMessage[]; thinking: boolean }>(function ChatTranscript({ messages, thinking }, ref) {
  const empty = messages.length === 0 && !thinking;
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
      {empty ? (
        <div className="flex h-full items-center justify-center px-6">
          <h1 className="text-center font-hand text-[44px] leading-none text-foreground">What can I help with?</h1>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[768px] flex-col gap-6 px-4 pb-8 pt-6">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[70%] whitespace-pre-wrap break-words rounded-[18px] bg-muted px-4 py-2.5 text-base leading-[1.6] text-foreground">{m.content}</div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-4">
                <div className="mt-1 size-6 shrink-0 rounded-full border border-border" aria-hidden />
                <div className="min-w-0 whitespace-pre-wrap break-words pt-0.5 text-base leading-[1.75] text-foreground">{m.content}</div>
              </div>
            ),
          )}
          {thinking && (
            <div className="flex gap-4">
              <div className="mt-1 size-6 shrink-0 rounded-full border border-border" aria-hidden />
              <div className="flex items-center pt-1">
                <span className="size-3 animate-pulse rounded-full bg-foreground" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
