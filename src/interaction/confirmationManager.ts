import type { GestureBindings } from "@/config/bindings";
import type { InputEvent } from "@/events/types";
import { isGestureEvent } from "@/events/types";
import type { ActionIntent } from "@/types/interaction";

/** Maps a gesture event to an interaction intent via the (user-editable) bindings. */
export function intentFor(event: InputEvent, bindings: GestureBindings): ActionIntent {
  if (!isGestureEvent(event.type)) return "NONE";
  return bindings[event.type] ?? "NONE";
}
