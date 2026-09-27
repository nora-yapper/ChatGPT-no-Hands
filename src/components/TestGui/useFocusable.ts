"use client";

import { useEffect, useRef } from "react";
import { pipeline } from "@/pipeline/Pipeline";
import type { FocusTarget } from "@/types/interaction";

/** Registers a DOM element as a focusable target with the focus manager. */
export function useFocusable<T extends HTMLElement>(target: FocusTarget) {
  const ref = useRef<T | null>(null);
  const { id, kind, label, action } = target;
  const payloadKey = JSON.stringify(target.payload ?? null);
  useEffect(() => {
    const t: FocusTarget = { id, kind, label, action, payload: JSON.parse(payloadKey) ?? undefined };
    return pipeline.focus.register(t, () => {
      const el = ref.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
  }, [id, kind, label, action, payloadKey]);
  return ref;
}
