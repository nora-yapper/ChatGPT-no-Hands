import type { Smoothing, Thresholds } from "@/config/thresholds";
import { DEFAULT_THRESHOLDS } from "@/config/thresholds";
import type { GestureBindings } from "@/config/bindings";
import { GESTURE_EVENT_TYPES, HEAD_POSE_GESTURE_TYPES, type HeadPoseGestureType } from "@/events/types";

/*
 * ISNT's own, simplified settings (Account › Settings). They never touch the Input Lab's values: ISNT derives
 * a *profile* from them (`profileFor`) that the pipeline overlays only while ISNT is open. Every control steps
 * through a fixed list of safe values, and the gesture map can never hold a conflict — see IMPROVEMENTS.md §9.
 */

/* ───────────── gestures ───────────── */

/** face gestures: the only ones that can confirm (a head gesture would move the pointer off the armed button) */
export type FaceGesture = "MOUTH_HOLD" | "BROW_RAISE_BOTH" | "LONG_BLINK";
export type IsntGesture = FaceGesture | HeadPoseGestureType;

export const GESTURES: Array<{ id: IsntGesture; label: string; explain: string; face: boolean }> = [
  { id: "MOUTH_HOLD", label: "Open mouth", explain: "Open your mouth and hold it for a moment. Talking doesn't count.", face: true },
  { id: "BROW_RAISE_BOTH", label: "Raise both eyebrows", explain: "Lift both eyebrows and hold them up briefly.", face: true },
  { id: "LONG_BLINK", label: "Long blink", explain: "Close your eyes for about half a second. Normal blinks don't count.", face: true },
  { id: "TURN_LEFT", label: "Turn head left", explain: "Turn your head far to the left and hold, then come back. Also moves the pointer.", face: false },
  { id: "TURN_RIGHT", label: "Turn head right", explain: "Turn your head far to the right and hold, then come back. Also moves the pointer.", face: false },
  { id: "TILT_UP", label: "Tilt head up", explain: "Look far up and hold, then come back. Paused while head scroll is on.", face: false },
  { id: "TILT_DOWN", label: "Tilt head down", explain: "Look far down and hold, then come back. Paused while head scroll is on.", face: false },
  { id: "ROLL_LEFT", label: "Head to left shoulder", explain: "Tip your head toward your left shoulder and hold. Doesn't move the pointer.", face: false },
  { id: "ROLL_RIGHT", label: "Head to right shoulder", explain: "Tip your head toward your right shoulder and hold. Doesn't move the pointer.", face: false },
];
const FACE: readonly string[] = ["MOUTH_HOLD", "BROW_RAISE_BOTH", "LONG_BLINK"];
export const isFaceGesture = (g: string): g is FaceGesture => FACE.includes(g);
const isGesture = (g: unknown): g is IsntGesture => typeof g === "string" && (FACE.includes(g) || (HEAD_POSE_GESTURE_TYPES as string[]).includes(g));
export const gestureLabel = (g: IsntGesture | null) => GESTURES.find((x) => x.id === g)?.label ?? "None";

/* ───────────── shortcut actions ───────────── */

export type ShortcutAction = "SCROLL_TOGGLE" | "ACCOUNT" | "BACK" | "SEND" | "NEW_CHAT" | "KEYBOARD" | "INCOGNITO";
/** "CONFIRM" is the confirmation gesture's slot; the rest are shortcuts */
export type GestureSlot = "CONFIRM" | ShortcutAction;

/**
 * `targetId`: the on-screen button the shortcut stands in for — the shortcut runs that button's own action,
 * and only while the button is registered (enabled and on screen), exactly like pointing at it and arming it.
 * Actions without a target (incognito, head scroll) aren't head-focusable buttons and run directly.
 */
export const ACTIONS: Array<{ id: GestureSlot; label: string; explain: string; targetId?: string }> = [
  { id: "CONFIRM", label: "Confirm", explain: "Selects the button you're pointing at, once it's ready (filled)." },
  { id: "SCROLL_TOGGLE", label: "Head scroll on / off", explain: "While on, tilting your head up or down scrolls the page." },
  { id: "ACCOUNT", label: "Go to Account", explain: "Opens this Account screen from anywhere.", targetId: "nav-account" },
  { id: "BACK", label: "Go back", explain: "Same as the Back button: removes the last word you picked.", targetId: "bar-back" },
  { id: "SEND", label: "Send", explain: "Same as the Send button: sends your message.", targetId: "bar-send" },
  { id: "NEW_CHAT", label: "New chat", explain: "Same as the New chat tab: starts a fresh chat.", targetId: "nav-new" },
  { id: "KEYBOARD", label: "Open keyboard", explain: "Same as the Keyboard button: type a word letter by letter.", targetId: "bar-keyboard" },
  { id: "INCOGNITO", label: "Temporary chat on / off", explain: "A temporary chat isn't saved to Recents." },
];
const SHORTCUTS = ACTIONS.map((a) => a.id).filter((id): id is ShortcutAction => id !== "CONFIRM");

/* ───────────── movement & tracking controls ───────────── */

export type LevelId = "pointerSpeed" | "steadiness" | "holdToArm" | "headRange" | "scrollSpeed" | "scrollStart" | "gestureStrength" | "gestureHold";

interface Patch {
  thresholds: Partial<Thresholds>;
  smoothing: Partial<Smoothing>;
}
interface LevelDef {
  id: LevelId;
  group: "Pointer movement" | "Head range" | "Head scroll" | "Gestures";
  label: string;
  explain: string;
  /** what the steps look like to the user */
  display: string[];
  defaultIndex: number;
  apply: (i: number, p: Patch) => void;
  /** About controls (More › About controls): what this control does underneath — kept here, next to the steps it describes */
  doc: { params: string; combine: string; defaults: string; range: string };
}

const HOLD_FACTORS = [0.6, 0.8, 1, 1.3, 1.6];
const D = DEFAULT_THRESHOLDS;

export const LEVELS: LevelDef[] = [
  {
    id: "pointerSpeed", group: "Pointer movement", label: "Pointer speed",
    explain: "How far the pointer moves when you move your head. Raise it if you have to turn a lot; lower it if the pointer overshoots.",
    display: ["1", "2", "3", "4", "5", "6", "7", "8"], defaultIndex: 3,
    apply: (i, p) => { p.thresholds.gridSensitivity = [0.45, 0.6, 0.75, 0.9, 1.1, 1.3, 1.55, 1.8][i]; },
    doc: { params: "pointer sensitivity", combine: "Single parameter, 8 steps", defaults: "0.9 (step 4)", range: "0.45 – 1.8" },
  },
  {
    id: "steadiness", group: "Pointer movement", label: "Steadiness",
    explain: "How much small, shaky head movement is ignored. Raise it if the pointer jitters or slips off buttons; lower it if it feels slow to react.",
    display: ["1", "2", "3", "4", "5"], defaultIndex: 2,
    apply: (i, p) => {
      p.thresholds.gridDeadZone = [0.1, 0.18, 0.25, 0.35, 0.45][i]; // head speed that counts as movement — never so high the pointer stops
      p.thresholds.gridHysteresis = [0.2, 0.3, 0.4, 0.5, 0.6][i]; // how strongly the current button holds on to the pointer
      p.smoothing.head = [0.55, 0.45, 0.35, 0.28, 0.22][i]; // lower = smoother, calmer head signal
    },
    doc: { params: "dead zone (head speed) · cell hysteresis · head smoothing", combine: "One step moves all three together. Steps 1–5: dead zone 0.10 / 0.18 / 0.25 / 0.35 / 0.45; hysteresis 0.20 / 0.30 / 0.40 / 0.50 / 0.60; smoothing 0.55 / 0.45 / 0.35 / 0.28 / 0.22 (lower is smoother)", defaults: "step 3 = 0.25 / 0.40 / 0.35", range: "dead zone ≤ 0.45, so the pointer can never freeze" },
  },
  {
    id: "holdToArm", group: "Pointer movement", label: "Hold to arm",
    explain: "How long you keep the pointer still on a button before it's ready to confirm. Raise it if buttons get ready too easily.",
    display: ["0.3 s", "0.4 s", "0.5 s", "0.65 s", "0.8 s", "1 s", "1.3 s"], defaultIndex: 2,
    apply: (i, p) => { p.thresholds.gazeHoldMs = [300, 400, 500, 650, 800, 1000, 1300][i]; },
    doc: { params: "gaze hold", combine: "Single parameter, 7 steps", defaults: "500 ms", range: "300 – 1300 ms" },
  },
  {
    id: "headRange", group: "Head range", label: "Head range",
    explain: "How far you turn your head to move across the whole screen. Lower it if turning is uncomfortable; raise it if the pointer feels jumpy.",
    display: ["12°", "14°", "16°", "18°", "20°", "23°", "26°", "30°"], defaultIndex: 4,
    apply: (i, p) => {
      const yaw = [12, 14, 16, 18, 20, 23, 26, 30][i];
      p.thresholds.headYawRangeDeg = yaw;
      p.thresholds.headPitchRangeDeg = Math.round(yaw * 0.75); // up/down is naturally a shorter movement
      p.thresholds.headRollRangeDeg = Math.round(yaw * 1.25);
    },
    doc: { params: "yaw range · pitch range · roll range", combine: "Left/right range is set directly; up/down is 0.75× of it, head roll 1.25×", defaults: "20° (up/down 15°, roll 25°)", range: "left/right 12–30°, up/down 9–23°, roll 15–38°" },
  },
  {
    id: "scrollSpeed", group: "Head scroll", label: "Scroll speed",
    explain: "How fast the page scrolls when you tilt your head all the way.",
    display: ["1", "2", "3", "4", "5"], defaultIndex: 2,
    apply: (i, p) => {
      p.thresholds.scrollMaxSpeed = [400, 600, 900, 1300, 1800][i];
      p.thresholds.scrollPageIntervalMs = [500, 380, 220, 160, 110][i]; // lists that turn page by page (Recents)
    },
    doc: { params: "max scroll speed · fastest page turn", combine: "Paired presets, one gets faster as the other gets shorter: 400 / 600 / 900 / 1300 / 1800 px/s with 500 / 380 / 220 / 160 / 110 ms", defaults: "900 px/s and 220 ms", range: "400–1800 px/s, 500–110 ms" },
  },
  {
    id: "scrollStart", group: "Head scroll", label: "Scroll start",
    explain: "How far you tilt your head before scrolling starts. Raise it if the page scrolls when you don't mean it to.",
    display: ["1", "2", "3", "4", "5", "6"], defaultIndex: 2,
    apply: (i, p) => { p.thresholds.scrollDeadzone = [0.06, 0.09, 0.12, 0.16, 0.2, 0.25][i]; },
    doc: { params: "scroll dead zone (head tilt)", combine: "Single parameter, 6 steps", defaults: "0.12", range: "0.06 – 0.25" },
  },
  {
    id: "gestureStrength", group: "Gestures", label: "Gesture strength",
    explain: "How big a face or head gesture must be to count. Lower it if gestures are missed; raise it if they happen by accident.",
    display: ["1", "2", "3", "4", "5"], defaultIndex: 2,
    apply: (i, p) => {
      p.thresholds.mouthOpenThreshold = [0.3, 0.38, 0.45, 0.55, 0.65][i];
      p.thresholds.browRaiseThreshold = [0.35, 0.42, 0.5, 0.6, 0.7][i];
      p.thresholds.headGestureThreshold = [0.7, 0.78, 0.85, 0.9, 0.95][i];
    },
    doc: { params: "mouth open threshold · brow raise threshold · head gesture threshold", combine: "One step moves all three: mouth 0.30–0.65, brows 0.35–0.70, head 0.70–0.95 of head range", defaults: "0.45 / 0.50 / 0.85", range: "those ranges" },
  },
  {
    id: "gestureHold", group: "Gestures", label: "Gesture hold",
    explain: "How long you hold a gesture before it counts. Raise it if gestures fire by accident.",
    display: HOLD_FACTORS.map((f) => `${f}×`), defaultIndex: 2,
    apply: (i, p) => {
      const f = HOLD_FACTORS[i];
      p.thresholds.mouthHoldMs = Math.round(D.mouthHoldMs * f);
      p.thresholds.browMinMs = Math.round(D.browMinMs * f);
      p.thresholds.longBlinkMs = Math.max(360, Math.round(D.longBlinkMs * f)); // always well above a natural blink
      p.thresholds.headGestureHoldMs = Math.round(D.headGestureHoldMs * f);
    },
    doc: { params: "mouth hold · brow min duration · long blink · head gesture hold", combine: "One multiplier (×0.6 / ×0.8 / ×1 / ×1.3 / ×1.6) applied to all four defaults. Long blink never goes below 360 ms, so a normal blink can't trigger it", defaults: "×1 = 500 / 300 / 600 / 400 ms", range: "mouth 300–800, brows 180–480, long blink 360–960, head 240–640 ms" },
  },
];

/** the two flips aren't steppers (LEVELS) but belong in the same Advanced table */
export const FLIP_DOCS = [
  { label: "Flip left / right", group: "Head range", params: "invert yaw", combine: "Single on/off", defaults: "off", range: "on / off" },
  { label: "Flip up / down", group: "Head range", params: "invert pitch", combine: "Single on/off", defaults: "off", range: "on / off" },
];

/* ───────────── settings ───────────── */

export interface IsntSettings {
  confirm: FaceGesture;
  shortcuts: Record<ShortcutAction, IsntGesture | null>;
  levels: Record<LevelId, number>;
  flipX: boolean;
  flipY: boolean;
  /** a just-changed confirmation gesture on probation: reverts to `previous` unless used before `deadline` */
  confirmTrial: { previous: FaceGesture; deadline: number } | null;
}

export const CONFIRM_TRIAL_MS = 20_000;

const defaultLevels = Object.fromEntries(LEVELS.map((l) => [l.id, l.defaultIndex])) as Record<LevelId, number>;
const noShortcuts = Object.fromEntries(SHORTCUTS.map((a) => [a, null])) as Record<ShortcutAction, IsntGesture | null>;

export const PRESETS: Array<{ id: string; label: string; explain: string; confirm: FaceGesture; shortcuts: Partial<Record<ShortcutAction, IsntGesture>> }> = [
  {
    id: "mouth", label: "Mouth confirms", explain: "Open mouth confirms, eyebrows toggle scrolling.",
    confirm: "MOUTH_HOLD",
    shortcuts: { SCROLL_TOGGLE: "BROW_RAISE_BOTH", ACCOUNT: "LONG_BLINK", BACK: "ROLL_LEFT", SEND: "ROLL_RIGHT" },
  },
  {
    id: "brows", label: "Eyebrows confirm", explain: "Raised eyebrows confirm, open mouth toggles scrolling.",
    confirm: "BROW_RAISE_BOTH",
    shortcuts: { SCROLL_TOGGLE: "MOUTH_HOLD", ACCOUNT: "LONG_BLINK", BACK: "ROLL_LEFT", SEND: "ROLL_RIGHT" },
  },
];

export const DEFAULT_ISNT: IsntSettings = {
  confirm: PRESETS[0].confirm,
  shortcuts: { ...noShortcuts, ...PRESETS[0].shortcuts },
  levels: defaultLevels,
  flipX: false,
  flipY: false,
  confirmTrial: null,
};

/** Which slot a gesture is assigned to, if any. */
export function slotOf(s: IsntSettings, g: IsntGesture): GestureSlot | null {
  if (s.confirm === g) return "CONFIRM";
  return SHORTCUTS.find((a) => s.shortcuts[a] === g) ?? null;
}

export function gestureOf(s: IsntSettings, slot: GestureSlot): IsntGesture | null {
  return slot === "CONFIRM" ? s.confirm : s.shortcuts[slot];
}

/**
 * Assign `gesture` to `slot`, keeping the map conflict-free: a gesture already used by another *shortcut*
 * moves (that shortcut becomes unassigned, reported as `moved`). Refused (`ok: false`): the confirm gesture
 * for a shortcut, a head gesture or None for Confirm. A new confirm gesture goes on trial (see `confirmTrial`).
 */
export function assign(s: IsntSettings, slot: GestureSlot, gesture: IsntGesture | null, now: number): { ok: boolean; settings: IsntSettings; moved: GestureSlot | null } {
  const refuse = { ok: false, settings: s, moved: null };
  if (slot === "CONFIRM") {
    if (!gesture || !isFaceGesture(gesture)) return refuse;
    if (gesture === s.confirm) return { ok: true, settings: s, moved: null };
    const moved = slotOf(s, gesture);
    const shortcuts = moved && moved !== "CONFIRM" ? { ...s.shortcuts, [moved]: null } : s.shortcuts;
    // keep the *original* fallback if a trial is already running (changing twice mustn't lose the working one)
    const previous = s.confirmTrial?.previous ?? s.confirm;
    return { ok: true, settings: { ...s, confirm: gesture, shortcuts, confirmTrial: { previous, deadline: now + CONFIRM_TRIAL_MS } }, moved };
  }
  if (gesture && gesture === s.confirm) return refuse;
  const moved = gesture ? slotOf(s, gesture) : null;
  const shortcuts = { ...s.shortcuts, ...(moved && moved !== slot ? { [moved]: null } : {}), [slot]: gesture };
  return { ok: true, settings: { ...s, shortcuts }, moved: moved && moved !== slot ? moved : null };
}

export function applyPreset(s: IsntSettings, presetId: string, now: number): IsntSettings {
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) return s;
  const confirmTrial = p.confirm === s.confirm ? s.confirmTrial : { previous: s.confirmTrial?.previous ?? s.confirm, deadline: now + CONFIRM_TRIAL_MS };
  return { ...s, confirm: p.confirm, shortcuts: { ...noShortcuts, ...p.shortcuts }, confirmTrial };
}

export function stepLevel(s: IsntSettings, id: LevelId, delta: 1 | -1): IsntSettings {
  const def = LEVELS.find((l) => l.id === id)!;
  const i = Math.min(def.display.length - 1, Math.max(0, s.levels[id] + delta));
  return i === s.levels[id] ? s : { ...s, levels: { ...s.levels, [id]: i } };
}

/** Movement / tracking back to defaults; the gesture map (a deliberate choice) is kept. */
export const resetMovement = (s: IsntSettings): IsntSettings => ({ ...s, levels: defaultLevels, flipX: false, flipY: false });

/** Keep a trialled confirmation gesture (it was used), or revert it (the trial ran out). */
export const commitConfirm = (s: IsntSettings): IsntSettings => (s.confirmTrial ? { ...s, confirmTrial: null } : s);
export function revertConfirm(s: IsntSettings): IsntSettings {
  if (!s.confirmTrial) return s;
  const previous = s.confirmTrial.previous;
  const moved = slotOf(s, previous); // the old gesture may have been handed to a shortcut meanwhile — take it back
  const shortcuts = moved && moved !== "CONFIRM" ? { ...s.shortcuts, [moved]: null } : s.shortcuts;
  return { ...s, confirm: previous, shortcuts, confirmTrial: null };
}

/** Any stored value → valid settings: unknown gestures dropped, levels clamped, conflicts resolved (confirm wins, then action order). */
export function sanitize(raw: unknown): IsntSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<IsntSettings>;
  const confirm = isGesture(r.confirm) && isFaceGesture(r.confirm) ? r.confirm : DEFAULT_ISNT.confirm;
  const used = new Set<string>([confirm]);
  const shortcuts = { ...noShortcuts };
  const src = r.shortcuts && typeof r.shortcuts === "object" ? r.shortcuts : DEFAULT_ISNT.shortcuts;
  for (const a of SHORTCUTS) {
    const g = (src as Record<string, unknown>)[a];
    if (isGesture(g) && !used.has(g)) {
      shortcuts[a] = g;
      used.add(g);
    }
  }
  const levels = { ...defaultLevels };
  for (const l of LEVELS) {
    const v = (r.levels as Record<string, unknown> | undefined)?.[l.id];
    if (typeof v === "number" && Number.isFinite(v)) levels[l.id] = Math.min(l.display.length - 1, Math.max(0, Math.round(v)));
  }
  const t = r.confirmTrial;
  const confirmTrial = t && isGesture(t.previous) && isFaceGesture(t.previous) && typeof t.deadline === "number" && t.previous !== confirm ? { previous: t.previous, deadline: t.deadline } : null;
  return { confirm, shortcuts, levels, flipX: r.flipX === true, flipY: r.flipY === true, confirmTrial };
}

/* ───────────── what the pipeline gets ───────────── */

export interface IsntProfile {
  thresholds: Partial<Thresholds>;
  smoothing: Partial<Smoothing>;
  /** only the confirmation gesture is bound (to CONFIRM); shortcuts are handled by ISNT, never by the FSM */
  bindings: GestureBindings;
  /** the gesture that toggles head scroll, or null for none */
  scrollToggle: IsntGesture | null;
}

export function profileFor(s: IsntSettings): IsntProfile {
  const p: Patch = { thresholds: { invertYaw: s.flipX, invertPitch: s.flipY, gridInput: "relative" }, smoothing: {} };
  for (const l of LEVELS) l.apply(s.levels[l.id], p);
  const bindings = Object.fromEntries(GESTURE_EVENT_TYPES.map((g) => [g, g === s.confirm ? "CONFIRM" : "NONE"])) as GestureBindings;
  return { ...p, bindings, scrollToggle: s.shortcuts.SCROLL_TOGGLE };
}

/** the shortcut (if any) a fired gesture event stands for */
export function shortcutFor(s: IsntSettings, eventType: string): ShortcutAction | null {
  return SHORTCUTS.find((a) => a !== "SCROLL_TOGGLE" && s.shortcuts[a] === eventType) ?? null;
}
