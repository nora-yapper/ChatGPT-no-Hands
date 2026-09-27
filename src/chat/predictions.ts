import { fallbackPredictions, selectPredictions, type Predictions } from "./predictionRules";

/**
 * One event of /api/predict's NDJSON stream: each accepted word / phrase the moment it exists, in the order it
 * fills its slots, then `done` ("model" when Claude supplied any of them, "fallback" when the local rules did).
 */
export type PredictEvent =
  | { type: "word"; text: string }
  | { type: "phrase"; text: string }
  | { type: "done"; source: "model" | "fallback"; error?: string };

export interface PredictionResult extends Predictions {
  /** model: Claude · fallback: Claude unavailable, local rules used · offline: Offline mode, never asked */
  source: "model" | "fallback" | "offline";
}

/** The local rules' 4 + 4, computed in the browser — Offline mode sends nothing anywhere. */
export function offlinePredictions(prompt: string): PredictionResult {
  return { ...selectPredictions({ words: [], phrases: [] }, prompt, fallbackPredictions(prompt)), source: "offline" };
}

/**
 * Asks the prediction route for the next 4 words + 4 phrases given the COMPLETE prompt so far, reporting each
 * word / phrase through `onPartial` the moment the server streams it (already validated there, so it never
 * changes afterwards). Resolves with the complete set. A request that fails before anything arrived is retried
 * once; one that fails midway throws, and the caller falls back to the local rules.
 */
export async function fetchPredictions(prompt: string, signal?: AbortSignal, offline = false, onPartial?: (p: Predictions) => void): Promise<PredictionResult> {
  if (offline) return offlinePredictions(prompt);
  try {
    return await streamPredictions(prompt, signal, onPartial);
  } catch (err) {
    if (signal?.aborted) throw err;
    await new Promise((r) => setTimeout(r, 400));
    return streamPredictions(prompt, signal, onPartial);
  }
}

async function streamPredictions(prompt: string, signal?: AbortSignal, onPartial?: (p: Predictions) => void): Promise<PredictionResult> {
  const res = await fetch("/api/predict", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`prediction request failed (${res.status})`);
  const words: string[] = [];
  const phrases: string[] = [];
  // The model writes in bursts (several lines within a few ms), so items are handed on at most one per
  // REVEAL_GAP_MS, in the order they were written: each field then visibly arrives on its own. A lone item
  // passes straight through.
  let released = 0;
  const pending: PredictEvent[] = [];
  let drain: Promise<void> = Promise.resolve();
  const release = () => {
    drain = drain.then(async () => {
      const wait = released + REVEAL_GAP_MS - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const e = pending.shift();
      if (!e || signal?.aborted) return;
      if (e.type === "word") words.push(e.text);
      else if (e.type === "phrase") phrases.push(e.text);
      released = performance.now();
      onPartial?.({ words: [...words], phrases: [...phrases] });
    });
  };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const e = JSON.parse(line) as PredictEvent;
      if (e.type === "done") {
        await drain; // resolve only once everything has been shown
        return { words, phrases, source: e.source };
      }
      pending.push(e);
      release();
    }
    if (done) throw new Error("prediction stream ended early");
  }
}

/** minimum spacing between two predictions appearing (see streamPredictions) */
const REVEAL_GAP_MS = 80;
