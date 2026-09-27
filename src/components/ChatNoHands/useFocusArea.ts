"use client";

import { useEffect, type RefObject } from "react";
import { pipeline } from "@/pipeline/Pipeline";

/**
 * Declares the element the 0..1 head pointer / grid cursor maps onto. Only one area is active at a
 * time (the last one to measure wins), so pass `active=false` while another surface owns the pointer.
 */
export function useFocusArea(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      pipeline.focus.setAreaRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [ref, active]);
}
