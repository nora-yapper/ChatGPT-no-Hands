"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import type { FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ChatFocusable } from "./ChatFocusable";

export interface TilePanelItem {
  target: FocusTarget;
  icon?: ReactNode;
  label: string;
  danger?: boolean;
}

/**
 * The popup menu used across the chat interface (Recents' chat / project menus, the settings "More" menu):
 * a floating panel with a small title and a grid of big head-selectable tiles, Close always last. With
 * `children`, the content fills the panel and the tiles become a single row underneath (e.g. Back + Close).
 * On the page background, not bg-card: in dark mode the card surface is the secondary tiles' own colour.
 * Placement comes from the caller (`className` / `style`).
 */
export function TilePanel({ title, items, close, enabled, lastFlash, onActivate, onHover, children, className, tilesClassName, style }: {
  title: string;
  items: TilePanelItem[];
  close: FocusTarget;
  enabled: boolean;
  lastFlash: Record<string, number>;
  onActivate: (t: FocusTarget) => void;
  /** mouse hover over a tile (id) / off it (null) — for callers that explain what's pointed at */
  onHover?: (id: string | null) => void;
  children?: ReactNode;
  className?: string;
  /** with `children`: override the height of the tile row underneath */
  tilesClassName?: string;
  style?: React.CSSProperties;
}) {
  // a grid of squarer tiles: up to 3 per row; with content above, one row
  const tiles = items.length + 1;
  const cols = children ? tiles : tiles <= 4 ? 2 : 3;
  const rows = children ? 1 : Math.ceil(tiles / cols);
  const tile = (target: FocusTarget, content: ReactNode, opts: { ghost?: boolean; danger?: boolean } = {}) => (
    <ChatFocusable key={target.id} target={target} enabled={enabled} flashKey={lastFlash[target.id]} radius="rounded-2xl" onActivate={onActivate}>
      <Button
        variant={opts.ghost ? "ghost" : "secondary"}
        role="menuitem"
        onMouseEnter={() => onHover?.(target.id)}
        onMouseLeave={() => onHover?.(null)}
        className={cn("h-full w-full flex-col gap-2 whitespace-normal rounded-2xl px-3 text-[15px] font-normal leading-snug [&_svg]:size-6", opts.ghost && "text-muted-foreground", opts.danger && "text-destructive")}
      >
        {content}
      </Button>
    </ChatFocusable>
  );
  return (
    <div className={cn("z-[5] flex min-h-0 flex-col rounded-[24px] border border-border bg-background p-3 shadow-[0_8px_32px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-200", className)} style={style} role="menu" aria-label={title}>
      <div className="mb-2 truncate px-2 text-xs font-medium text-muted-foreground">{title}</div>
      {children && <div className="mb-2 min-h-0 flex-1">{children}</div>}
      <div className={cn("grid gap-2", children ? cn("h-[clamp(3.5rem,11vh,6rem)] shrink-0", tilesClassName) : "min-h-0 flex-1")} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {items.map((it) => tile(it.target, <>{it.icon} {it.label}</>, { danger: it.danger }))}
        {tile(close, <><X /> Close</>, { ghost: true })}
      </div>
    </div>
  );
}
