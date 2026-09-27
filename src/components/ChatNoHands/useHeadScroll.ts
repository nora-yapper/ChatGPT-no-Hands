"use client";

import { useEffect, useRef } from "react";
import { pipeline } from "@/pipeline/Pipeline";
import type { ScrollTarget } from "@/gestures/headScrollController";

/**
 * Declares the scrollable/pageable surface head-pitch scrolling should drive while `active`. Only one
 * surface is live at a time (the last one to activate wins), same pattern as useFocusArea. `target`'s own
 * identity may change every render — only `active` toggling re-registers it, so pass fresh callbacks freely.
 */
export function useHeadScrollTarget(target: ScrollTarget, active: boolean) {
  const ref = useRef(target);
  // keep the ref pointing at the latest callbacks without reading/writing it during render
  useEffect(() => {
    ref.current = target;
  });
  useEffect(() => {
    if (!active) return;
    pipeline.headScroll.setTarget({
      scrollBy: (d) => ref.current.scrollBy?.(d),
      step: (dir) => ref.current.step?.(dir),
    });
    return () => pipeline.headScroll.setTarget(null);
  }, [active]);
}
