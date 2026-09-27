export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** performance.now() when the message was created */
  at: number;
}

let counter = 0;
export function newMessage(role: ChatRole, content: string): ChatMessage {
  return { id: `m${++counter}-${Date.now()}`, role, content, at: performance.now() };
}

/** Sends the conversation to the server-side model route and returns the reply text. */
export async function askAssistant(history: ChatMessage[]): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
  });
  const data = (await res.json()) as { reply?: string; error?: string };
  if (!res.ok || !data.reply) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.reply;
}
