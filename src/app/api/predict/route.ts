import { NextResponse } from "next/server";
import { PHRASES_PER_SET, WORDS_PER_SET, fallbackPredictions, selectPredictions, type Predictions } from "@/chat/predictionRules";
import { generateCandidates, hasCredentials, type Candidates } from "@/server/llm";

export const runtime = "nodejs";

interface PredictResponse extends Predictions {
  /** "model" when an LLM produced the candidates, "fallback" when local rules did */
  source: "model" | "fallback";
  error?: string;
}

/** POST { prompt } → { words[4], phrases[4], source }. Always receives the complete prompt built so far. */
export async function POST(req: Request) {
  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const fallback = fallbackPredictions(prompt);
  if (!hasCredentials()) {
    const res: PredictResponse = { ...selectPredictions({ words: [], phrases: [] }, prompt, fallback), source: "fallback" };
    return NextResponse.json(res);
  }
  // §28/§35: full request → one retry → simpler request → local fallback. Malformed or thin results count as failures.
  const attempts: Array<() => Promise<Candidates>> = [() => generateCandidates(prompt), () => generateCandidates(prompt), () => generateCandidates(prompt, true)];
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const picked = selectPredictions(await attempt(), prompt);
      if (picked.words.length === WORDS_PER_SET && picked.phrases.length === PHRASES_PER_SET) {
        const res: PredictResponse = { ...picked, source: "model" };
        return NextResponse.json(res);
      }
      lastError = new Error("model returned too few valid candidates");
    } catch (err) {
      lastError = err;
    }
  }
  console.error("[predict] falling back after model failures:", lastError);
  const res: PredictResponse = { ...selectPredictions({ words: [], phrases: [] }, prompt, fallback), source: "fallback", error: String(lastError) };
  return NextResponse.json(res);
}
