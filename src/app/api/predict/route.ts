import { PredictionSelector, fallbackPredictions, parseCandidateLine } from "@/chat/predictionRules";
import type { PredictEvent } from "@/chat/predictions";
import { generateCandidates, hasCredentials, streamCandidateLines } from "@/server/llm";

export const runtime = "nodejs";

/**
 * POST { prompt } → NDJSON stream of PredictEvents. Always receives the complete prompt built so far.
 * §28/§35: streamed request → one plain (non-streamed) retry for whatever is still missing → local rules.
 * Every candidate is validated / de-duplicated as it arrives (PredictionSelector), so what's shown never changes.
 */
export async function POST(req: Request) {
  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!prompt) return Response.json({ error: "prompt required" }, { status: 400 });

  const encoder = new TextEncoder();
  let cancelled = false; // the page moved on (new pick / Back) and stopped reading
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    async start(controller) {
      const send = (e: PredictEvent) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      };
      const sel = new PredictionSelector(prompt);
      const offer = (kind: "word" | "phrase", text: string) => {
        const accepted = kind === "word" ? sel.offerWord(text) : sel.offerPhrase(text);
        if (accepted) send({ type: kind, text: accepted });
      };
      let fromModel = 0;
      let lastError: unknown = null;

      if (hasCredentials()) {
        try {
          for await (const line of streamCandidateLines(prompt, req.signal)) {
            const c = parseCandidateLine(line);
            if (!c) continue;
            const before = sel.words.length + sel.phrases.length;
            offer(c.kind, c.text);
            fromModel += sel.words.length + sel.phrases.length - before;
            if (sel.full || cancelled) break;
          }
        } catch (err) {
          lastError = err;
        }
        if (!sel.full && !req.signal.aborted && !cancelled) {
          try {
            const more = await generateCandidates(prompt, true);
            const before = sel.words.length + sel.phrases.length;
            for (const w of more.words) offer("word", w);
            for (const p of more.phrases) offer("phrase", p);
            fromModel += sel.words.length + sel.phrases.length - before;
          } catch (err) {
            lastError = err;
          }
        }
        if (!sel.full) console.error("[predict] topping up from local rules:", lastError ?? "too few valid candidates");
      }

      const added = sel.topUp(fallbackPredictions(prompt));
      for (const w of added.words) send({ type: "word", text: w });
      for (const p of added.phrases) send({ type: "phrase", text: p });
      send({ type: "done", source: fromModel > 0 ? "model" : "fallback", ...(lastError ? { error: String(lastError) } : {}) });
      if (!cancelled) controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
