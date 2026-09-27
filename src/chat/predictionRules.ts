/**
 * Pure rules for the spatial prediction engine: what counts as a valid word / phrase candidate,
 * how duplicates and near-duplicates are removed, and how the final 4 + 4 are picked for diversity.
 * No I/O here so it runs on the server, in the browser and in tests.
 */

export interface Predictions {
  /** exactly 4 single words (diagonal slots: ↖ ↗ ↘ ↙) */
  words: string[];
  /** exactly 4 phrases of 3–5 words (cardinal slots: ↑ → ↓ ←) */
  phrases: string[];
}

export const WORDS_PER_SET = 4;
export const PHRASES_PER_SET = 4;

/**
 * High-utility prompt starters shown before the first selection (prototype vocabulary, not a frequency claim):
 * question words plus the task verbs from common prompt-writing terms (UMN CCAPS list, see README) that open a
 * chat request on their own. The rest of those verbs come one step later, through the predictions.
 */
export const STARTERS = ["What", "How", "Why", "Can", "Summarize", "Help", "Create", "Write", "Explain", "Compare"];

const WORD_RE = /^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u;
const STOP = new Set(["a", "an", "the", "of", "to", "for", "in", "on", "and", "or", "my", "your", "with", "that", "this", "is", "are"]);

export const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
const key = (s: string) => normalize(s).toLowerCase().replace(/[.,;:!?"”“]+$/g, "");
const tokens = (s: string) => key(s).split(" ").filter(Boolean);
const content = (s: string) => new Set(tokens(s).filter((t) => !STOP.has(t)));

export function isValidWord(w: string): boolean {
  const t = normalize(w);
  return t.length > 0 && t.length <= 24 && !t.includes(" ") && WORD_RE.test(t);
}

export function isValidPhrase(p: string): boolean {
  const n = tokens(p).length;
  return n >= 3 && n <= 5 && normalize(p).length <= 60 && !/[.!?]$/.test(normalize(p));
}

/** Two phrases are "the same idea" when they share their first two words or most of their content words. */
export function phrasesOverlap(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.slice(0, 2).join(" ") === tb.slice(0, 2).join(" ")) return true;
  const ca = content(a);
  const cb = content(b);
  if (!ca.size || !cb.size) return false;
  let shared = 0;
  for (const t of ca) if (cb.has(t)) shared++;
  return shared / Math.min(ca.size, cb.size) > 0.5;
}

/** Grammatical / contextual sanity: don't offer the word the prompt already ends with, or a word already in its tail. */
function repeatsTail(candidate: string, prompt: string): boolean {
  const tail = tokens(prompt).slice(-3);
  const first = tokens(candidate)[0];
  return !!first && tail.includes(first) && !STOP.has(first);
}

/**
 * Validate → dedupe → drop repeats → keep a semantically spread set, one candidate at a time: candidates arrive
 * in the model's preference order (streamed, or all at once), so the first survivors win and a later candidate
 * replaces nothing. `offer*` returns the cleaned text when it was accepted, so a stream can pass it on at once.
 */
export class PredictionSelector {
  readonly words: string[] = [];
  readonly phrases: string[] = [];
  private seenWords = new Set<string>();
  constructor(private prompt: string) {}

  get full() {
    return this.words.length === WORDS_PER_SET && this.phrases.length === PHRASES_PER_SET;
  }

  offerWord(raw: string): string | null {
    const w = normalize(raw).replace(/[.,;:!?]+$/g, "");
    if (this.words.length === WORDS_PER_SET || !isValidWord(w) || this.seenWords.has(w.toLowerCase()) || repeatsTail(w, this.prompt)) return null;
    this.seenWords.add(w.toLowerCase());
    this.words.push(w);
    return w;
  }

  offerPhrase(raw: string): string | null {
    const p = normalize(raw).replace(/[.,;:!?]+$/g, "");
    if (this.phrases.length === PHRASES_PER_SET || !isValidPhrase(p) || repeatsTail(p, this.prompt)) return null;
    if (this.phrases.some((q) => key(q) === key(p) || phrasesOverlap(q, p))) return null;
    this.phrases.push(p);
    return p;
  }

  /** fill whatever is still missing from the local rules (these skip the repeat check: they're known-good) */
  topUp(fallback: Predictions): { words: string[]; phrases: string[] } {
    const added = { words: [] as string[], phrases: [] as string[] };
    for (const w of fallback.words) {
      if (this.words.length < WORDS_PER_SET && !this.seenWords.has(w.toLowerCase()) && isValidWord(w)) {
        this.words.push(w);
        this.seenWords.add(w.toLowerCase());
        added.words.push(w);
      }
    }
    for (const p of fallback.phrases) {
      if (this.phrases.length < PHRASES_PER_SET && !this.phrases.some((q) => key(q) === key(p) || phrasesOverlap(q, p))) {
        this.phrases.push(p);
        added.phrases.push(p);
      }
    }
    return added;
  }

  result(): Predictions {
    return { words: [...this.words], phrases: [...this.phrases] };
  }
}

/** The whole selection at once (see PredictionSelector). */
export function selectPredictions(candidates: { words: string[]; phrases: string[] }, prompt: string, fallback?: Predictions): Predictions {
  const sel = new PredictionSelector(prompt);
  for (const w of candidates.words) if (sel.offerWord(w) && sel.words.length === WORDS_PER_SET) break;
  for (const p of candidates.phrases) if (sel.offerPhrase(p) && sel.phrases.length === PHRASES_PER_SET) break;
  if (fallback) sel.topUp(fallback);
  return sel.result();
}

/**
 * One line of the streamed prediction format (see PREDICT_STREAM_FORMAT in server/llm.ts): "W: word" or
 * "P: a short phrase". Tolerates list markers, quotes and case; anything else is ignored.
 */
export function parseCandidateLine(line: string): { kind: "word" | "phrase"; text: string } | null {
  const m = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?([WP])\s*[:|]\s*(.+?)\s*$/i.exec(line);
  if (!m) return null;
  const text = m[2].replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (!text) return null;
  return { kind: m[1].toUpperCase() === "W" ? "word" : "phrase", text };
}

/** Append a selected word or phrase to the canonical prompt with sensible spacing. */
export function appendToPrompt(prompt: string, piece: string): string {
  const p = normalize(piece);
  if (!p) return prompt;
  if (!prompt) return p.charAt(0).toUpperCase() + p.slice(1);
  if (/^[,.;:!?]/.test(p)) return prompt + p;
  return `${prompt.replace(/\s+$/, "")} ${p}`;
}

/* ───────────── offline fallback (no API key / request failed) ───────────── */

const FALLBACK: Array<[RegExp, Predictions]> = [
  [/^(what)$/i, { words: ["is", "are", "does", "makes"], phrases: ["are possible ways to", "is the difference between", "would happen if", "can I do about"] }],
  [/^(how)$/i, { words: ["do", "can", "does", "should"], phrases: ["can I improve my", "does it work when", "should I start with", "do I explain"] }],
  [/^(why)$/i, { words: ["do", "is", "does", "are"], phrases: ["do people often", "is it important to", "does it matter if", "are some designers"] }],
  [/^(can|could)$/i, { words: ["you", "I", "we", "it"], phrases: ["you help me write", "you summarize this text", "you outline a plan", "you compare two options"] }],
  [/^(help)$/i, { words: ["me", "with", "us", "a"], phrases: ["me write a message", "me outline an essay", "me understand a topic", "me review my draft"] }],
  [/^(create|write|give)$/i, { words: ["a", "an", "three", "me"], phrases: ["a short description for", "a list of ideas", "an outline for a", "a friendly email to"] }],
  [/^(explain)$/i, { words: ["how", "why", "what", "the"], phrases: ["step by step how", "the difference between two", "why it matters for", "in simple terms how"] }],
  // the common prompt-writing verbs (UMN CCAPS list): starters, or offered one step later
  [/^(summarize|summarise)$/i, { words: ["this", "the", "my", "an"], phrases: ["the key points of", "this article in bullets", "my notes into a", "a long email thread"] }],
  [/^(compare|contrast)$/i, { words: ["two", "these", "the", "different"], phrases: ["the pros and cons", "two options for my", "these approaches side by side", "different ways to learn"] }],
  [/^(describe|define|outline|analyze|analyse|review|identify|clarify|illustrate)$/i, { words: ["the", "how", "what", "my"], phrases: ["the main ideas of", "how this process works", "what makes it different", "my draft in detail"] }],
  [/^(elaborate)$/i, { words: ["on", "more", "further", "briefly"], phrases: ["on the last point", "on your previous answer", "with a concrete example", "in more detail on"] }],
  [/\b(website|app|page|portfolio)$/i, { words: ["for", "that", "with", "using"], phrases: ["for my design portfolio", "with a minimal visual style", "that showcases selected projects", "for a fictional design studio"] }],
  [/\b(for|about)$/i, { words: ["my", "a", "an", "the"], phrases: ["my portfolio project", "an upcoming design event", "a fictional startup", "a small local business"] }],
];
const GENERIC: Predictions = { words: ["and", "with", "for", "that"], phrases: ["with a minimal style", "in a friendly tone", "for a general audience", "using simple examples"] };
const COMPLETE: Predictions = { words: ["briefly", "clearly", "please", "today"], phrases: ["with a minimal visual style", "in a few short paragraphs", "with concrete examples", "using a clear structure"] };

export function fallbackPredictions(prompt: string): Predictions {
  const last = tokens(prompt).at(-1) ?? "";
  const hit = FALLBACK.find(([re]) => re.test(last) || re.test(prompt));
  if (hit) return hit[1];
  return tokens(prompt).length >= 6 ? COMPLETE : GENERIC;
}
