import { useSyncExternalStore } from "react";
import { DEFAULT_SMOOTHING, DEFAULT_THRESHOLDS, type Smoothing, type Thresholds } from "@/config/thresholds";
import { DEFAULT_BINDINGS, type GestureBindings } from "@/config/bindings";
import type { FocusMode } from "@/types/interaction";
import type { CalibrationBaseline } from "@/types/signals";
import type { ScrollToggleGesture } from "@/gestures/scrollToggleDetector";
import { DEFAULT_ISNT, sanitize as sanitizeIsnt, type IsntSettings } from "@/isnt/isntSettings";

export interface Settings {
  thresholds: Thresholds;
  smoothing: Smoothing;
  bindings: GestureBindings;
  focusMode: FocusMode;
  /** gesture that toggles continuous head-driven scrolling on/off */
  scrollToggleGesture: ScrollToggleGesture;
  mirror: boolean;
  showLandmarks: boolean;
  experimentMode: boolean;
  showRaw: boolean;
  maxEvents: number;
  calibration: CalibrationBaseline | null;
  /** ISNT's own simplified settings — never read by the Input Lab; the pipeline sees them only as ISNT's profile */
  isnt: IsntSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  thresholds: DEFAULT_THRESHOLDS,
  smoothing: DEFAULT_SMOOTHING,
  bindings: DEFAULT_BINDINGS,
  focusMode: "pointer",
  scrollToggleGesture: "BROW_RAISE_BOTH",
  mirror: true,
  showLandmarks: true,
  experimentMode: true,
  showRaw: false,
  maxEvents: 500,
  calibration: null,
  isnt: DEFAULT_ISNT,
};

const STORAGE_KEY = "input-lab.settings.v1";

function load(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      thresholds: { ...DEFAULT_THRESHOLDS, ...(parsed.thresholds ?? {}) },
      smoothing: { ...DEFAULT_SMOOTHING, ...(parsed.smoothing ?? {}) },
      bindings: { ...DEFAULT_BINDINGS, ...(parsed.bindings ?? {}) },
      isnt: sanitizeIsnt(parsed.isnt),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Synchronous settings store: the pipeline reads get() every frame; React reads via useSettings(). */
class SettingsStore {
  private value: Settings = DEFAULT_SETTINGS;
  private listeners = new Set<() => void>();
  private hydrated = false;

  hydrate() {
    if (this.hydrated) return;
    this.hydrated = true;
    this.value = load();
    this.notify();
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
    const p = typeof patch === "function" ? patch(this.value) : patch;
    this.value = { ...this.value, ...p };
    this.persist();
    this.notify();
  }

  setThreshold<K extends keyof Thresholds>(key: K, v: Thresholds[K]) {
    this.set((s) => ({ thresholds: { ...s.thresholds, [key]: v } }));
  }

  setSmoothing<K extends keyof Smoothing>(key: K, v: Smoothing[K]) {
    this.set((s) => ({ smoothing: { ...s.smoothing, [key]: v } }));
  }

  setBinding(gesture: keyof GestureBindings, intent: GestureBindings[keyof GestureBindings]) {
    this.set((s) => ({ bindings: { ...s.bindings, [gesture]: intent } }));
  }

  resetToDefaults() {
    this.set({ thresholds: DEFAULT_THRESHOLDS, smoothing: DEFAULT_SMOOTHING, bindings: DEFAULT_BINDINGS, focusMode: "pointer", scrollToggleGesture: DEFAULT_SETTINGS.scrollToggleGesture });
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.value));
    } catch {
      /* ignore quota / private mode */
    }
  }

  private notify() {
    for (const l of this.listeners) l();
  }
}

export const settingsStore = new SettingsStore();

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, () => settingsStore.get(), () => DEFAULT_SETTINGS);
}
