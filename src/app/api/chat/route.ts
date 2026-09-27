import { NextResponse } from "next/server";
import { chatReply, hasCredentials, type ChatTurn } from "@/server/llm";

export const runtime = "nodejs";

/** POST { messages: [{role, content}] } → { reply, source }. */
export async function POST(req: Request) {
  let history: ChatTurn[] = [];
  try {
    const body = (await req.json()) as { messages?: unknown };
    if (!Array.isArray(body.messages)) throw new Error("messages must be an array");
    history = body.messages
      .filter((m): m is ChatTurn => !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
  const last = history.filter((m) => m.role === "user").at(-1)?.content.trim();
  if (!last) return NextResponse.json({ error: "no user message" }, { status: 400 });

  if (!hasCredentials()) {
    return NextResponse.json({ reply: `(No language model is connected — set ANTHROPIC_API_KEY to enable replies.)\n\nYou wrote: “${last}”`, source: "fallback" });
  }
  try {
    return NextResponse.json({ reply: await chatReply(history), source: "model" });
  } catch (err) {
    console.error("[chat]", err);
    return NextResponse.json({ reply: `The request failed: ${String(err)}`, source: "fallback" });
  }
}
