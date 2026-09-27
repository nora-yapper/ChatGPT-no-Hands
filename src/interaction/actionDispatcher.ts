import type { ActionEvent } from "@/types/interaction";

export type ActionHandler = (action: ActionEvent) => void;

/** The only bridge from the interaction engine to the GUI. The GUI registers handlers; it never sees gestures. */
export class ActionDispatcher {
  private handlers = new Set<ActionHandler>();

  register(handler: ActionHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  dispatch(action: ActionEvent) {
    for (const h of this.handlers) h(action);
  }
}
