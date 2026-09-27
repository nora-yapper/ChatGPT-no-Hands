export type InteractionState =
  | "IDLE"
  | "NAVIGATING"
  | "FOCUSED"
  | "ARMED"
  | "CONFIRMING"
  | "EXECUTING"
  | "COOLDOWN"
  | "TRACKING_LOST";

export const INTERACTION_STATES: InteractionState[] = [
  "IDLE",
  "NAVIGATING",
  "FOCUSED",
  "ARMED",
  "CONFIRMING",
  "EXECUTING",
  "COOLDOWN",
  "TRACKING_LOST",
];

export type TargetKind = "card" | "button" | "key";

export interface FocusTarget {
  id: string;
  kind: TargetKind;
  label: string;
  /** action name executed when this target is confirmed (e.g. SELECT, DELETE, TYPE) */
  action: string;
  /** extra payload for the action, e.g. the character for a key */
  payload?: Record<string, unknown>;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** What a gesture means to the interaction engine. */
export type ActionIntent = "CONFIRM" | "CANCEL" | "ACTIVATE" | "OPEN_MENU" | "NONE";

export const ACTION_INTENTS: ActionIntent[] = ["CONFIRM", "CANCEL", "ACTIVATE", "OPEN_MENU", "NONE"];

export type FocusMode = "pointer" | "discrete" | "grid";

export interface ActionEvent {
  timestamp: number;
  action: string;
  target: FocusTarget | null;
  /** explanation of why this action fired */
  reason: {
    triggerEvent: string;
    triggerDuration?: number;
    triggerConfidence: number;
    thresholdName?: string;
    thresholdValue?: number;
    dwellMs?: number;
    intent: ActionIntent;
  };
}
