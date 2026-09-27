import type { FocusTarget } from "@/types/interaction";
import type { Predictions } from "@/chat/predictionRules";
import { STARTERS } from "@/chat/predictionRules";

export type Screen = "new" | "recents" | "account";
export type Phase = "starters" | "predict";

/** Fixed spatial grammar: phrases on the cardinal slots, single words on the diagonals. */
export const PHRASE_SLOTS = ["n", "e", "s", "w"] as const;
export const WORD_SLOTS = ["nw", "ne", "se", "sw"] as const;
export type Slot = (typeof PHRASE_SLOTS)[number] | (typeof WORD_SLOTS)[number];

export const starterTarget = (w: string): FocusTarget => ({ id: `start-${w.toLowerCase()}`, kind: "card", label: w, action: "PICK", payload: { text: w } });
export const slotTarget = (slot: Slot, text: string): FocusTarget => ({ id: `slot-${slot}`, kind: "card", label: text, action: "PICK", payload: { text, slot } });

export const BAR_KEYBOARD: FocusTarget = { id: "bar-keyboard", kind: "button", label: "Keyboard", action: "OPEN_KEYBOARD" };
export const BAR_BACK: FocusTarget = { id: "bar-back", kind: "button", label: "Back", action: "UNDO" };
export const BAR_EXPAND: FocusTarget = { id: "bar-expand", kind: "button", label: "Expand prompt", action: "TOGGLE_EXPAND" };
export const BAR_SEND: FocusTarget = { id: "bar-send", kind: "button", label: "Send", action: "SEND" };
/** reading mode (ongoing conversation, composer collapsed) */
export const READ_UP: FocusTarget = { id: "read-up", kind: "button", label: "Scroll up", action: "SCROLL_UP" };
export const READ_DOWN: FocusTarget = { id: "read-down", kind: "button", label: "Scroll down", action: "SCROLL_DOWN" };
export const READ_REPLY: FocusTarget = { id: "read-reply", kind: "button", label: "Reply", action: "COMPOSE" };
/** composing in an ongoing conversation: return to reading it */
export const SHOW_CONVERSATION: FocusTarget = { id: "show-conversation", kind: "button", label: "Show conversation", action: "READ" };
export const NAV: Record<Screen, FocusTarget> = {
  new: { id: "nav-new", kind: "button", label: "New chat", action: "NAV", payload: { screen: "new" } },
  recents: { id: "nav-recents", kind: "button", label: "Recents", action: "NAV", payload: { screen: "recents" } },
  account: { id: "nav-account", kind: "button", label: "Account", action: "NAV", payload: { screen: "account" } },
};

/** Starters as 4 / 3 / 3 rows – wide targets for head selection. */
export const STARTER_ROWS: string[][] = [STARTERS.slice(0, 4), STARTERS.slice(4, 7), STARTERS.slice(7, 10)];

/** Compass as a 3×3 field: [nw n ne] / [w · e] / [sw s se]. The middle field is the current text. */
export const COMPASS_ROWS: Array<Array<Slot | null>> = [
  ["nw", "n", "ne"],
  ["w", null, "e"],
  ["sw", "s", "se"],
];

export function slotText(slot: Slot, p: Predictions | null): string | null {
  if (!p) return null;
  const pi = (PHRASE_SLOTS as readonly string[]).indexOf(slot);
  if (pi >= 0) return p.phrases[pi] ?? null;
  const wi = (WORD_SLOTS as readonly string[]).indexOf(slot);
  return p.words[wi] ?? null;
}

export const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm?.,"];
export const KB_BACKSPACE: FocusTarget = { id: "kb-backspace", kind: "key", label: "Backspace", action: "KB_BACKSPACE" };
export const KB_SPACE: FocusTarget = { id: "kb-space", kind: "key", label: "Space", action: "KB_SPACE" };
export const KB_CANCEL: FocusTarget = { id: "kb-cancel", kind: "button", label: "Cancel", action: "KB_CANCEL" };
export const KB_CONFIRM: FocusTarget = { id: "kb-confirm", kind: "button", label: "Add to prompt", action: "KB_CONFIRM" };
export const keyTarget = (ch: string): FocusTarget => ({ id: `kb-${ch}`, kind: "key", label: ch, action: "KB_TYPE", payload: { char: ch } });

/** the same on-screen keyboard, reused to rename a Recents chat or project entirely by head movement */
export const RK_BACKSPACE: FocusTarget = { id: "rk-backspace", kind: "key", label: "Backspace", action: "RC_RENAME_BACKSPACE" };
export const RK_SPACE: FocusTarget = { id: "rk-space", kind: "key", label: "Space", action: "RC_RENAME_SPACE" };
export const RK_CLEAR: FocusTarget = { id: "rk-clear", kind: "key", label: "Clear", action: "RC_RENAME_CLEAR" };
export const RK_CANCEL: FocusTarget = { id: "rk-cancel", kind: "button", label: "Cancel", action: "RC_RENAME_CANCEL" };
export const RK_SAVE: FocusTarget = { id: "rk-save", kind: "button", label: "Save name", action: "RC_RENAME_DONE" };
export const rkKeyTarget = (ch: string): FocusTarget => ({ id: `rk-${ch}`, kind: "key", label: ch, action: "RC_RENAME_TYPE", payload: { char: ch } });


/* ───────────── base grid ─────────────
 * The New Chat screen is laid out on a fine base grid. Every control spans a whole number of base cells and
 * unrelated controls are separated by empty base cells, so the Grid Glide fields (measured from the DOM)
 * are base-grid aligned and the empty space between them really is empty. CSS grid lines are 1-based and
 * `end` is exclusive, as in `grid-column: start / end`. */
/**
 * One block, 25 base columns wide, shared by every row: the input bar and the tabs span the whole width, while
 * the word grid sits inside it between the Keyboard column (left) and the Back column (right), each 3 columns
 * wide and separated from the words by a 2-column gutter.
 */
export const SIDE_COLS = 3;
export const GUTTER_COLS = 2;
export const WORD_COLS = 15;
export const BASE_COLS = SIDE_COLS + GUTTER_COLS + WORD_COLS + GUTTER_COLS + SIDE_COLS;
export const BASE_ROWS = 17;
/** cursor may be this far (fraction of the area) from a field and still land on it — about one base gap, never a whole empty cell */
export const BASE_SNAP = 0.012;

/**
 * Row tracks: the 9 compass rows flex with the available height, everything below is fixed in pixels so the
 * input bar and the navigation never move, whatever is shown above them (heading, transcript, nothing).
 */
export const BASE_ROW_TEMPLATE = ["repeat(9, minmax(0, 1fr))", "repeat(2, 20px)", "repeat(3, 40px)", "16px", "repeat(2, 36px)"].join(" ");
/** pixel height of the fixed bottom part (rows 10–17 plus the gaps between them) */
export const BASE_BOTTOM_PX = 2 * 20 + 3 * 40 + 16 + 2 * 36 + 7 * 8;

export interface Span {
  col: string;
  row: string;
}

/** word-grid column span (1-based within the 15 word columns, end exclusive) → absolute grid lines */
const words = (start: number, end: number) => `${SIDE_COLS + GUTTER_COLS + start} / ${SIDE_COLS + GUTTER_COLS + end}`;
/** span across the whole block, as a fraction pair of 25ths */
const full = (start: number, end: number) => `${start} / ${end}`;

export const BASE_PLACEMENT = {
  /** 2 rows × 5 starters, 3 main columns each, one empty base row between the rows */
  starter: (i: number): Span => ({ col: words((i % 5) * 3 + 1, (i % 5) * 3 + 4), row: i < 5 ? "1 / 5" : "6 / 10" }),
  /** 3 × 3 compass, each field 5 main columns × 3 base rows */
  compass: (r: number, c: number): Span => ({ col: words(c * 5 + 1, c * 5 + 6), row: `${r * 3 + 1} / ${r * 3 + 4}` }),
  /** the expanded-prompt panel and the placeholder screens cover the compass area */
  content: { col: words(1, 16), row: "1 / 10" } as Span,
  /** the Keyboard escape hatch: the block's left column, as tall as the word grid */
  keyboard: { col: full(1, SIDE_COLS + 1), row: "1 / 10" } as Span,
  /** in an ongoing conversation the left column is shared: Keyboard on top, Show conversation below */
  keyboardSplit: { col: full(1, SIDE_COLS + 1), row: "1 / 6" } as Span,
  conversation: { col: full(1, SIDE_COLS + 1), row: "6 / 10" } as Span,
  /** reading mode: the transcript fills the whole block; the bar row is scroll up | scroll down | reply */
  transcript: { col: full(1, BASE_COLS + 1), row: "1 / 10" } as Span,
  read: { up: { col: full(1, 6), row: "12 / 15" }, down: { col: full(6, 11), row: "12 / 15" }, reply: { col: full(11, BASE_COLS + 1), row: "12 / 15" } } as Record<"up" | "down" | "reply", Span>,
  /** Back: the block's right column, as tall as the word grid */
  back: { col: full(BASE_COLS - SIDE_COLS + 1, BASE_COLS + 1), row: "1 / 10" } as Span,
  /** input bar (base rows 12–14, two empty rows below the word grid) across the whole block: prompt ~2/3, send ~1/3 */
  bar: { prompt: { col: full(1, 18), row: "12 / 15" }, send: { col: full(18, BASE_COLS + 1), row: "12 / 15" } } as Record<"prompt" | "send", Span>,
  /** the opened-project bar: info | new chat | all recents, same outer edges as `bar` */
  projectBar: { info: { col: full(1, 11), row: "12 / 15" }, newChat: { col: full(11, 18), row: "12 / 15" }, allRecents: { col: full(18, BASE_COLS + 1), row: "12 / 15" } } as Record<"info" | "newChat" | "allRecents", Span>,
  /** bottom navigation: three tabs sharing the whole block width (9 / 8 / 8 columns) */
  nav: (i: number): Span => ({ col: full([1, 10, 18][i], [10, 18, BASE_COLS + 1][i]), row: "16 / 18" }),
};

/* ───────────── colour grammar ─────────────
 * Starters use the full pastel rainbow (one hue per word). On the prediction screens the four cardinal phrase
 * fields take the colour of the starter the user first chose, and the four diagonal word fields share one
 * random pastel, picked once for that starter choice and kept for the rest of the prompt. If the first word
 * was typed rather than chosen, the compass falls back to the default purple / blue combination. */
export const PHRASE_TINT = 7; // lavender
export const WORD_TINT = 5; // sky blue
export const PASTEL_COUNT = 10;

export interface CompassTints {
  phrase: number;
  word: number;
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * @param firstStarter the starter word the user chose first, or null when the prompt was started another way
 * @param pickId identifies this particular choice (e.g. when it was made) so the random word colour differs
 *               between conversations but stays the same for the whole prompt
 */
export function compassTints(firstStarter: string | null, pickId: string | number): CompassTints {
  const idx = firstStarter ? STARTERS.findIndex((w) => w.toLowerCase() === firstStarter.toLowerCase()) : -1;
  if (idx < 0) return { phrase: PHRASE_TINT, word: WORD_TINT };
  const pool = Array.from({ length: PASTEL_COUNT }, (_, i) => i).filter((i) => i !== idx);
  return { phrase: idx, word: pool[hash(`${firstStarter}|${pickId}`) % pool.length] };
}
export const tint = (i: number) => `var(--pastel-${((i % 10) + 10) % 10})`;
/** the same hue, more saturated — the dwell-fill colour for a pastel-tinted focusable (see ChatFocusable) */
export const fillTint = (i: number) => `var(--pastel-fill-${((i % 10) + 10) % 10})`;
