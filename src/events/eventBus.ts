import type { InputEvent, NewInputEvent } from "./types";

type Listener = (event: InputEvent) => void;

/**
 * Central typed event bus with a bounded ring buffer of recent events.
 * The pipeline emits here; UI panels and the interaction engine subscribe.
 */
export class EventBus {
  private listeners = new Set<Listener>();
  private buffer: InputEvent[] = [];
  private nextId = 1;
  private maxEvents: number;
  private version = 0;
  private versionListeners = new Set<() => void>();

  constructor(maxEvents = 500) {
    this.maxEvents = maxEvents;
  }

  emit(event: NewInputEvent): InputEvent {
    const full: InputEvent = { ...event, id: this.nextId++ };
    this.buffer.push(full);
    if (this.buffer.length > this.maxEvents) {
      this.buffer.splice(0, this.buffer.length - this.maxEvents);
    }
    this.version++;
    for (const l of this.listeners) l(full);
    for (const l of this.versionListeners) l();
    return full;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notified whenever the buffer changes (for UI polling). */
  onChange(listener: () => void): () => void {
    this.versionListeners.add(listener);
    return () => this.versionListeners.delete(listener);
  }

  getVersion(): number {
    return this.version;
  }

  getEvents(): readonly InputEvent[] {
    return this.buffer;
  }

  /** Returns the most recent event of the given type, if any. */
  last(type: InputEvent["type"]): InputEvent | undefined {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].type === type) return this.buffer[i];
    }
    return undefined;
  }

  tag(id: number, metadata: Record<string, unknown>) {
    const e = this.buffer.find((x) => x.id === id);
    if (e) {
      e.metadata = { ...e.metadata, ...metadata };
      this.version++;
      for (const l of this.versionListeners) l();
    }
  }

  setMaxEvents(n: number) {
    this.maxEvents = Math.max(10, n);
    if (this.buffer.length > this.maxEvents) {
      this.buffer.splice(0, this.buffer.length - this.maxEvents);
      this.version++;
      for (const l of this.versionListeners) l();
    }
  }

  clear() {
    this.buffer = [];
    this.version++;
    for (const l of this.versionListeners) l();
  }

  exportJSON(): string {
    return JSON.stringify(this.buffer, null, 2);
  }
}
