"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  /** the text whose end must stay visible; re-pins and re-measures when it changes */
  tail: string;
  /** reports whether the text is taller than the box (i.e. cut off) */
  onOverflow?: (overflowing: boolean) => void;
  /** fade the cut-off edge to show there is more above */
  fade?: boolean;
}

/**
 * Text that wraps but never grows past `className`'s max-height: it scrolls internally and stays pinned to
 * its end, so the newest words are always visible and the surrounding layout never moves. Used for the
 * prompt bar, the current-text panel and the keyboard preview.
 */
export function TailText({ children, className, tail, onOverflow, fade, ...rest }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const reported = useRef<boolean | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      el.scrollTop = el.scrollHeight;
      const o = el.scrollHeight > el.clientHeight + 1;
      if (o === reported.current) return; // only notify on change, never from inside a state updater
      reported.current = o;
      setOverflowing(o);
      onOverflow?.(o);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tail, onOverflow]);
  return (
    <div ref={ref} className={cn("min-w-0 overflow-hidden whitespace-pre-wrap break-words", fade && overflowing && "[mask-image:linear-gradient(to_bottom,transparent,black_45%)]", className)} {...rest}>
      {children}
    </div>
  );
}
