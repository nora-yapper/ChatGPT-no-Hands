import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { PHRASES_PER_SET, WORDS_PER_SET } from "@/chat/predictionRules";

/**
 * The one place the app talks to a language model. Both routes (/api/predict, /api/chat) go through here.
 * Credentials come from the environment (ANTHROPIC_API_KEY or an `ant auth login` profile); without them
 * the routes fall back to local behaviour so the interaction prototype still works offline.
 */
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export function hasCredentials(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

let client: Anthropic | null = null;
function getClient() {
  return (client ??= new Anthropic());
}

const CandidateSchema = z.object({
  words: z.array(z.string()).describe("Single-word continuations, most useful first"),
  phrases: z.array(z.string()).describe("3–5 word continuations, most useful first"),
});
export type Candidates = z.infer<typeof CandidateSchema>;

const PREDICT_SYSTEM = `You are generating navigation options for a hands-free AI prompt composition interface.

The user is constructing a prompt by selecting suggested words and phrases. Given the COMPLETE CURRENT PROMPT, generate two separate sets of continuations, best first:

1. SINGLE-WORD CONTINUATIONS ("words"): exactly one word each; a natural grammatical continuation; highly relevant to the entire prompt; useful as the immediate next word. No punctuation, no filler, no repeats.
2. PHRASE CONTINUATIONS ("phrases"): 3–5 words each; a natural grammatical continuation; relevant to the entire prompt; each should meaningfully advance or refine the user's intention; the set must be semantically diverse — different subjects, purposes or constraints, never four variations of one idea. No trailing punctuation.

Consider the complete meaning (instruction, output type, audience, context). Once the prompt already reads as a complete request, shift phrases toward refinement (style, scope, tone, format, constraints) instead of forcing it longer.

Do not rewrite the existing prompt. Do not repeat substantial parts of it. Do not include explanations. Return structured JSON only.`;

/**
 * Ask for candidates. `simple` is the second-chance request used when the full one fails or comes back
 * malformed: fewer, plainer options and a smaller output budget.
 */
export async function generateCandidates(prompt: string, simple = false): Promise<Candidates> {
  const want = simple ? `Return exactly ${WORDS_PER_SET} words and exactly ${PHRASES_PER_SET} phrases.` : `Return ${WORDS_PER_SET * 2} words and ${PHRASES_PER_SET * 2} phrases so the interface can pick the most diverse ${WORDS_PER_SET} + ${PHRASES_PER_SET}.`;
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: simple ? 512 : 1024,
    system: `${PREDICT_SYSTEM}\n\n${want}`,
    output_config: { effort: "low", format: zodOutputFormat(CandidateSchema) },
    messages: [{ role: "user", content: `COMPLETE CURRENT PROMPT:\n"""${prompt}"""` }],
  });
  return response.parsed_output ?? { words: [], phrases: [] };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const CHAT_SYSTEM = "You are a helpful assistant inside a hands-free chat interface. The user composed their message by selecting words with head movements, so it may be terse or slightly ungrammatical; interpret it generously. Answer clearly and concisely.";

export async function chatReply(history: ChatTurn[]): Promise<string> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: CHAT_SYSTEM,
    output_config: { effort: "low" },
    messages,
  });
  if (response.stop_reason === "refusal") return "I can't help with that request.";
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
