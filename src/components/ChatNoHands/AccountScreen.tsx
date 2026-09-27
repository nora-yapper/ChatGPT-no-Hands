"use client";

import { useCallback, useState } from "react";
import { LogOut, Pencil } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import type { FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ChatFocusable } from "./ChatFocusable";
import { IsntSettingsPanel } from "./IsntSettingsPanel";
import { BASE_COLS, tint, type Span } from "./spatial";

/* ───────────── placement on the shared base grid ─────────────
 * Same block as Recents, as tall as the block above the nav row: the profile card in the left third, ISNT's
 * own settings in the right two thirds. */
const PROFILE_SPAN: Span = { col: "1 / 9", row: "1 / 15" };
const SETTINGS_SPAN: Span = { col: `9 / ${BASE_COLS + 1}`, row: "1 / 15" };
/** the whole screen block, tabs included: where More › About controls opens (its table needs the room) */
const BLOCK_SPAN: Span = { col: `1 / ${BASE_COLS + 1}`, row: "1 / 18" };
/** the avatar's pastel, fixed rather than derived from a prompt choice like the compass fields */
const AVATAR_TINT = 6; // periwinkle

const ACCOUNT_LOG_OUT: FocusTarget = { id: "account-logout", kind: "button", label: "Log out", action: "LOG_OUT" };
const ACCOUNT_EDIT_NAME: FocusTarget = { id: "account-edit-name", kind: "button", label: "Edit name", action: "ACCOUNT_EDIT_NAME" };
const ACCOUNT_EDIT_EMAIL: FocusTarget = { id: "account-edit-email", kind: "button", label: "Edit email", action: "ACCOUNT_EDIT_EMAIL" };

const place = (s: Span): React.CSSProperties => ({ gridColumn: s.col, gridRow: s.row });

export interface AccountScreenProps {
  enabled: boolean;
  lastFlash: Record<string, number>;
  onActivate: (t: FocusTarget) => void;
  name: string;
  email: string;
  /** More › About controls covers the whole screen block, tabs included, while open */
  onCoverNav?: (covered: boolean) => void;
}

/**
 * Account: the left third is the profile section — a big pastel avatar, identity, plan, and Log out
 * anchored to the bottom of the card. The right two thirds are ISNT's settings (gestures and movement).
 */
export function AccountScreen({ enabled, lastFlash, onActivate, name, email, onCoverNav }: AccountScreenProps) {
  // More › About controls is portalled into a host over the whole block; while it's open the profile card is
  // covered, so its controls stop being head targets too
  const [advancedHost, setAdvancedHost] = useState<HTMLDivElement | null>(null);
  const [covered, setCoveredState] = useState(false);
  const setCovered = useCallback((c: boolean) => { setCoveredState(c); onCoverNav?.(c); }, [onCoverNav]);
  const live = enabled && !covered;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <>
      <div className="flex min-h-0 flex-col items-center gap-5 rounded-[24px] border border-border bg-card px-6 py-8 animate-in fade-in duration-300" style={place(PROFILE_SPAN)}>
        <div className="pastel flex aspect-square w-3/4 shrink-0 items-center justify-center rounded-full text-5xl font-semibold tracking-tight" style={{ ["--tint" as string]: tint(AVATAR_TINT) }} aria-hidden>
          {initials}
        </div>
        <div className="flex w-full flex-col gap-2">
          <EditableField target={ACCOUNT_EDIT_NAME} value={name} primary enabled={live} lastFlash={lastFlash} onActivate={onActivate} />
          <EditableField target={ACCOUNT_EDIT_EMAIL} value={email} enabled={live} lastFlash={lastFlash} onActivate={onActivate} />
        </div>
        <Badge variant="secondary" className="px-3 py-1 text-[13px] font-medium">Free plan</Badge>
        <ChatFocusable target={ACCOUNT_LOG_OUT} enabled={live} flashKey={lastFlash[ACCOUNT_LOG_OUT.id]} radius="rounded-2xl" className="mt-auto w-full" onActivate={onActivate}>
          <Button variant="outline" className="h-11 w-full gap-2 rounded-2xl text-[15px] font-normal">
            <LogOut className="size-4.5" /> Log out
          </Button>
        </ChatFocusable>
      </div>
      <IsntSettingsPanel enabled={enabled} lastFlash={lastFlash} onActivate={onActivate} style={place(SETTINGS_SPAN)} advancedHost={advancedHost} onCover={setCovered} />
    <div ref={setAdvancedHost} className="pointer-events-none relative z-[5]" style={place(BLOCK_SPAN)} />
    </>
  );
}

/**
 * A name or email shown as a full-width, head-selectable row — never a small icon-only button, so it stays
 * an easy gaze/head-pointer target — that opens the same on-screen keyboard used to rename a chat or
 * project, pre-loaded with the current value.
 */
function EditableField({ target, value, primary, enabled, lastFlash, onActivate }: { target: FocusTarget; value: string; primary?: boolean; enabled: boolean; lastFlash: Record<string, number>; onActivate: (t: FocusTarget) => void }) {
  return (
    <ChatFocusable target={target} enabled={enabled} flashKey={lastFlash[target.id]} radius="rounded-xl" className="w-full" onActivate={onActivate}>
      <Button
        variant="ghost"
        aria-label={target.label}
        className={cn("h-11 w-full justify-between gap-2 rounded-xl px-3 font-normal hover:bg-muted", primary ? "text-base font-semibold" : "text-sm text-muted-foreground")}
      >
        <span className="truncate">{value}</span>
        <Pencil className="size-4 shrink-0 opacity-60" aria-hidden />
      </Button>
    </ChatFocusable>
  );
}
