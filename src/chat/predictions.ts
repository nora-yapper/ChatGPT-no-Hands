import type { Predictions } from "./predictionRules";

export interface PredictionResult extends Predictions {
  source: "model" | "fallback";
}

/** Asks the prediction route for the next 4 words + 4 phrases given the COMPLETE prompt so far. */
export async function fetchPredictions(prompt: string, signal?: AbortSignal): Promise<PredictionResult> {
  try {
    return await requestPredictions(prompt, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    await new Promise((r) => setTimeout(r, 400));
    return requestPredictions(prompt, signal);
  }
}

async function requestPredictions(prompt: string, signal?: AbortSignal): Promise<PredictionResult> {
  const res = await fetch("/api/predict", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!res.ok) throw new Error(`prediction request failed (${res.status})`);
  const data = (await res.json()) as PredictionResult;
  if (!Array.isArray(data.words) || !Array.isArray(data.phrases)) throw new Error("malformed prediction response");
  return data;
}
