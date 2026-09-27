import type { InteractionState, ActionEvent, FocusTarget } from "@/types/interaction";
import type { InputEvent, NewInputEvent } from "@/events/types";
import type { Thresholds } from "@/config/thresholds";
import type { GestureBindings } from "@/config/bindings";
import { intentFor } from "./confirmationManager";

export interface StateMachineInput {
  t: number;
  tracking: boolean;
  /** target currently under the pointer / selected by stepping */
  focus: FocusTarget | null;
  pointerMoving: boolean;
  /** events produced this frame by the detectors (gesture + gaze events) */
  events: InputEvent[];
  thresholds: Thresholds;
  bindings: GestureBindings;
}

export interface StateMachineOutput {
  events: NewInputEvent[];
  actions: ActionEvent[];
}

export interface StateSnapshot {
  state: InteractionState;
  since: number;
  armedTarget: FocusTarget | null;
  focusTarget: FocusTarget | null;
  lastAction: ActionEvent | null;
  lastTransitionReason: string;
  cooldownRemainingMs: number;
}

/** how long CONFIRMING/EXECUTING each stay visible before moving on — also the GUI's cue for how long the
 * post-confirm cooldown fade should run before cooldownMs itself takes over */
export const HOLD_VISIBLE_MS = 150;

/**
 * IDLE → NAVIGATING → FOCUSED → ARMED → CONFIRMING → EXECUTING → COOLDOWN.
 * Only ARMED (+ a CONFIRM-bound gesture) or ACTIVATE (from FOCUSED/ARMED) reaches EXECUTING.
 * Looking at a target never executes anything by itself.
 */
export class InteractionStateMachine {
  private state: InteractionState = "IDLE";
  private since = 0;
  private armedTarget: FocusTarget | null = null;
  private armedAt = 0;
  private focusTarget: FocusTarget | null = null;
  private focusLostAt: number | null = null;
  private pendingAction: ActionEvent | null = null;
  private lastAction: ActionEvent | null = null;
  private reason = "init";
  private cooldownUntil = 0;
  private lastDwellMs = 0;

  getSnapshot(t: number): StateSnapshot {
    return {
      state: this.state,
      since: this.since,
      armedTarget: this.armedTarget,
      focusTarget: this.focusTarget,
      lastAction: this.lastAction,
      lastTransitionReason: this.reason,
      cooldownRemainingMs: this.state === "COOLDOWN" ? Math.max(0, this.cooldownUntil - t) : 0,
    };
  }

  getState() {
    return this.state;
  }

  reset(t: number) {
    this.transition("IDLE", t, "reset", []);
    this.armedTarget = null;
    this.pendingAction = null;
  }

  update(input: StateMachineInput): StateMachineOutput {
    const { t, thresholds: th } = input;
    const out: NewInputEvent[] = [];
    const actions: ActionEvent[] = [];
    this.focusTarget = input.focus;

    // --- tracking loss beats everything; nothing may execute while lost
    if (!input.tracking) {
      if (this.state !== "TRACKING_LOST") {
        this.armedTarget = null;
        this.pendingAction = null;
        this.transition("TRACKING_LOST", t, "tracking lost", out);
      }
      return { events: out, actions };
    }
    if (this.state === "TRACKING_LOST") {
      this.transition("IDLE", t, "tracking recovered", out);
    }

    // --- timed states
    if (this.state === "CONFIRMING") {
      if (t - this.since >= HOLD_VISIBLE_MS && this.pendingAction) {
        this.transition("EXECUTING", t, `executing ${this.pendingAction.action}`, out);
        actions.push(this.pendingAction);
        this.lastAction = this.pendingAction;
        out.push({
          type: "EXECUTE", timestamp: t, confidence: this.pendingAction.reason.triggerConfidence, source: "interaction",
          metadata: { action: this.pendingAction.action, target: this.pendingAction.target?.id ?? null, targetLabel: this.pendingAction.target?.label ?? null, ...this.pendingAction.reason },
        });
        this.pendingAction = null;
      }
      return { events: out, actions };
    }
    if (this.state === "EXECUTING") {
      if (t - this.since >= HOLD_VISIBLE_MS) {
        this.cooldownUntil = t + th.cooldownMs;
        this.transition("COOLDOWN", t, `cooldown ${th.cooldownMs} ms`, out);
      }
      return { events: out, actions };
    }
    if (this.state === "COOLDOWN") {
      if (t >= this.cooldownUntil) {
        this.armedTarget = null;
        this.transition(input.focus ? "FOCUSED" : "IDLE", t, "cooldown over", out);
      }
      return { events: out, actions };
    }

    // --- gesture / gaze events
    for (const ev of input.events) {
      if (ev.type === "GAZE_HOLD" && input.focus && ev.metadata?.target === input.focus.id) {
        if (this.state === "FOCUSED" || this.state === "NAVIGATING" || this.state === "IDLE") {
          this.armedTarget = input.focus;
          this.armedAt = t;
          this.lastDwellMs = ev.duration ?? 0;
          this.transition("ARMED", t, `gaze held ${Math.round(ev.duration ?? 0)} ms on ${input.focus.label}`, out);
        }
        continue;
      }
      const intent = intentFor(ev, input.bindings);
      if (intent === "NONE") continue;

      if (intent === "CANCEL") {
        if (this.state === "FOCUSED" || this.state === "ARMED") {
          out.push({ type: "CANCEL", timestamp: t, confidence: ev.confidence, source: "interaction", metadata: { trigger: ev.type, target: this.armedTarget?.id ?? input.focus?.id ?? null } });
          this.armedTarget = null;
          this.transition(input.focus ? "FOCUSED" : "IDLE", t, `cancelled by ${ev.type}${input.focus ? " (disarmed, still focused)" : ""}`, out);
        }
        continue;
      }

      if (intent === "OPEN_MENU") {
        const action = this.makeAction(t, "OPEN_MENU", null, ev, intent);
        this.pendingAction = action;
        out.push({ type: "CONFIRM", timestamp: t, confidence: ev.confidence, source: "interaction", metadata: { trigger: ev.type, intent, target: null } });
        this.transition("CONFIRMING", t, `${ev.type} → OPEN_MENU`, out);
        return { events: out, actions };
      }

      const target = this.state === "ARMED" ? this.armedTarget : intent === "ACTIVATE" ? input.focus : null;
      const allowed =
        (intent === "CONFIRM" && this.state === "ARMED" && !!target) ||
        (intent === "ACTIVATE" && (this.state === "ARMED" || this.state === "FOCUSED") && !!target);
      if (!allowed) {
        out.push({
          type: "SYSTEM", timestamp: t, confidence: ev.confidence, source: "interaction",
          metadata: { note: `${ev.type} (${intent}) ignored in state ${this.state}`, trigger: ev.type, intent, state: this.state },
        });
        continue;
      }
      const action = this.makeAction(t, target!.action, target!, ev, intent);
      this.pendingAction = action;
      out.push({ type: "CONFIRM", timestamp: t, confidence: ev.confidence, source: "interaction", metadata: { trigger: ev.type, intent, target: target!.id, targetLabel: target!.label, dwellMs: this.lastDwellMs } });
      this.transition("CONFIRMING", t, `${ev.type} confirmed ${target!.label}`, out);
      return { events: out, actions };
    }

    // --- focus-driven transitions
    if (this.state === "ARMED") {
      if (input.focus && this.armedTarget && input.focus.id !== this.armedTarget.id) {
        this.armedTarget = null;
        this.transition("FOCUSED", t, `focus moved to ${input.focus.label}`, out);
      } else if (!input.focus) {
        if (this.focusLostAt === null) this.focusLostAt = t;
        if (t - this.focusLostAt > th.armGraceMs) {
          this.armedTarget = null;
          this.focusLostAt = null;
          this.transition(input.pointerMoving ? "NAVIGATING" : "IDLE", t, `left target for > ${th.armGraceMs} ms`, out);
        }
      } else {
        this.focusLostAt = null;
      }
      return { events: out, actions };
    }

    if (input.focus) {
      if (this.state !== "FOCUSED") this.transition("FOCUSED", t, `focus on ${input.focus.label}`, out);
    } else if (input.pointerMoving) {
      if (this.state !== "NAVIGATING") this.transition("NAVIGATING", t, "pointer moving", out);
    } else if (this.state !== "IDLE") {
      this.transition("IDLE", t, "no target, pointer still", out);
    }
    return { events: out, actions };
  }

  private makeAction(t: number, action: string, target: FocusTarget | null, ev: InputEvent, intent: ActionEvent["reason"]["intent"]): ActionEvent {
    const thresholdName = ev.type === "LONG_BLINK" ? "longBlinkMs" : ev.type === "NOD" ? "nodThreshold" : ev.type === "HEAD_SHAKE" ? "shakeThreshold" : ev.type === "MOUTH_HOLD" ? "mouthHoldMs" : ev.type.startsWith("BROW") ? "browRaiseThreshold" : undefined;
    const thresholdValue = thresholdName ? (ev.metadata?.[thresholdName === "longBlinkMs" ? "longBlinkMs" : thresholdName === "mouthHoldMs" ? "holdMs" : "threshold"] as number | undefined) : undefined;
    return {
      timestamp: t,
      action,
      target,
      reason: {
        triggerEvent: ev.type,
        triggerDuration: ev.duration,
        triggerConfidence: ev.confidence,
        thresholdName,
        thresholdValue,
        dwellMs: target ? this.lastDwellMs : undefined,
        intent,
      },
    };
  }

  private transition(next: InteractionState, t: number, reason: string, out: NewInputEvent[]) {
    const prev = this.state;
    this.state = next;
    this.since = t;
    this.reason = reason;
    if (next !== "ARMED") this.focusLostAt = null;
    out.push({ type: "STATE_CHANGE", timestamp: t, confidence: 1, source: "interaction", metadata: { from: prev, to: next, reason } });
  }
}
