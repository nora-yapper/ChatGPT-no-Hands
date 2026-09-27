import type { GestureEventType } from "@/events/types";
import type { ActionIntent } from "@/types/interaction";

export type GestureBindings = Record<GestureEventType, ActionIntent>;

export const DEFAULT_BINDINGS: GestureBindings = {
  BLINK: "NONE",
  LONG_BLINK: "CONFIRM",
  NOD: "CONFIRM",
  HEAD_SHAKE: "CANCEL",
  MOUTH_OPEN: "NONE",
  MOUTH_HOLD: "NONE",
  BROW_RAISE_LEFT: "NONE",
  BROW_RAISE_RIGHT: "NONE",
  BROW_RAISE_BOTH: "NONE",
  LOOK_AWAY: "NONE",
};
