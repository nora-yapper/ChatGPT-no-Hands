export type GestureEventType =
  | "BLINK"
  | "LONG_BLINK"
  | "NOD"
  | "HEAD_SHAKE"
  | "MOUTH_OPEN"
  | "MOUTH_HOLD"
  | "BROW_RAISE_LEFT"
  | "BROW_RAISE_RIGHT"
  | "BROW_RAISE_BOTH"
  | "LOOK_AWAY";

export const GESTURE_EVENT_TYPES: GestureEventType[] = [
  "BLINK",
  "LONG_BLINK",
  "NOD",
  "HEAD_SHAKE",
  "MOUTH_OPEN",
  "MOUTH_HOLD",
  "BROW_RAISE_LEFT",
  "BROW_RAISE_RIGHT",
  "BROW_RAISE_BOTH",
  "LOOK_AWAY",
];

export type InputEventType =
  | GestureEventType
  | "GAZE_ENTER"
  | "GAZE_EXIT"
  | "GAZE_HOLD"
  | "HEAD_STEP"
  | "GRID_CELL"
  | "TRACKING_LOST"
  | "TRACKING_RECOVERED"
  | "STATE_CHANGE"
  | "CONFIRM"
  | "CANCEL"
  | "EXECUTE"
  | "CALIBRATED"
  | "FALSE_POSITIVE"
  | "SCROLL_MODE_TOGGLE"
  | "SYSTEM";

export type EventSource = "head" | "eyes" | "face" | "system" | "interaction";

export interface InputEvent {
  id: number;
  type: InputEventType;
  timestamp: number;
  /** heuristic confidence 0..1 */
  confidence: number;
  duration?: number;
  source: EventSource;
  metadata?: Record<string, unknown>;
}

export type NewInputEvent = Omit<InputEvent, "id">;

export function isGestureEvent(type: InputEventType): type is GestureEventType {
  return (GESTURE_EVENT_TYPES as string[]).includes(type);
}
