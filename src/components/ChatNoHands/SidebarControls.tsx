"use client";

import { useLayoutEffect, useRef } from "react";
import { FlaskConical, MessageSquare, Moon, PanelLeft, Sun, WifiOff } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import type { FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ChatFocusable } from "./ChatFocusable";
import { useHeadScrollTarget } from "./useHeadScroll";

/*
 * The chat interface's sidebar controls, head-focusable like everything else: the pointer's area is the whole
 * window (see ChatNoHands' root ref), and each control is a tile at least 48px tall so it is comfortable
 * to reach by head. Head confirms and mouse clicks both arrive as SB_* actions — see `sidebarAction`.
 * Pass enabled=false while the sidebar is closed: its controls still have boxes (clipped by the 0-width
 * aside), and must not stay behind as invisible fields.
 */

export type InterfaceId = "lab" | "chat";

const INTERFACES: Array<{ id: InterfaceId; label: string; href: string; icon: React.ReactNode }> = [
  { id: "lab", label: "Input Lab", href: "/lab", icon: <FlaskConical className="size-5" /> },
  { id: "chat", label: "ISNT", href: "/chat", icon: <MessageSquare className="size-5" /> },
];

const SB_CLOSE: FocusTarget = { id: "sb-close", kind: "button", label: "Close sidebar", action: "SB_CLOSE" };
const SB_OPEN: FocusTarget = { id: "sb-open", kind: "button", label: "Open sidebar", action: "SB_OPEN" };
const SB_THEME: FocusTarget = { id: "sb-theme", kind: "button", label: "Toggle light / dark mode", action: "SB_THEME" };
const SB_OFFLINE: FocusTarget = { id: "sb-offline", kind: "button", label: "Toggle Offline mode", action: "SB_OFFLINE" };
/** the current interface's entry starts a new chat there (as the old sidebar did); the others navigate */
const interfaceTarget = (i: (typeof INTERFACES)[number], current: InterfaceId): FocusTarget =>
  i.id === current
    ? { id: `sb-go-${i.id}`, kind: "button", label: i.label, action: "SB_NEW_CHAT" }
    : { id: `sb-go-${i.id}`, kind: "button", label: i.label, action: "SB_GO", payload: { href: i.href } };

export interface SidebarHandlers {
  setSidebarOpen: (open: boolean) => void;
  toggleTheme: () => void;
  toggleOffline: () => void;
  navigate: (href: string) => void;
  newChat: () => void;
}

/** Runs a sidebar action; returns false for any other action so the caller's own switch can handle it. */
export function sidebarAction(action: string, target: FocusTarget | null, h: SidebarHandlers): boolean {
  switch (action) {
    case "SB_CLOSE": h.setSidebarOpen(false); return true;
    case "SB_OPEN": h.setSidebarOpen(true); return true;
    case "SB_THEME": h.toggleTheme(); return true;
    case "SB_OFFLINE": h.toggleOffline(); return true;
    case "SB_GO": h.navigate(target?.payload?.href as string); return true;
    case "SB_NEW_CHAT": h.newChat(); return true;
    default: return false;
  }
}

interface Common {
  enabled: boolean;
  lastFlash: Record<string, number>;
  onActivate: (t: FocusTarget) => void;
}

function SidebarIconButton({ target, enabled, lastFlash, onActivate }: Common & { target: FocusTarget }) {
  return (
    <ChatFocusable target={target} enabled={enabled} flashKey={lastFlash[target.id]} radius="rounded-xl" onActivate={onActivate}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" aria-label={target.label} className="size-12 rounded-xl text-foreground">
            <PanelLeft className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{target.label}</TooltipContent>
      </Tooltip>
    </ChatFocusable>
  );
}

/** "Close sidebar", in the sidebar's top bar */
export const SidebarCloseButton = (p: Common) => <SidebarIconButton target={SB_CLOSE} {...p} />;
/** "Open sidebar", in the main header while the sidebar is closed */
export const SidebarOpenButton = (p: Common) => <SidebarIconButton target={SB_OPEN} {...p} />;

/** the interface switcher */
export function SidebarInterfaces({ current, ...p }: Common & { current: InterfaceId }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">Interfaces</div>
      {INTERFACES.map((i) => {
        const target = interfaceTarget(i, current);
        return (
          <ChatFocusable key={i.id} target={target} enabled={p.enabled} flashKey={p.lastFlash[target.id]} radius="rounded-xl" onActivate={p.onActivate}>
            <button type="button" aria-current={i.id === current ? "page" : undefined} className={cn("flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-accent", i.id === current && "bg-accent")}>
              {i.icon} {i.label}
            </button>
          </ChatFocusable>
        );
      })}
    </nav>
  );
}

/** the light/dark toggle at the bottom of the sidebar */
export function SidebarThemeToggle({ theme, ...p }: Common & { theme: "light" | "dark" }) {
  return (
    <ChatFocusable target={SB_THEME} enabled={p.enabled} flashKey={p.lastFlash[SB_THEME.id]} radius="rounded-xl" className="mt-2" onActivate={p.onActivate}>
      <button type="button" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm hover:bg-accent">
        {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />} {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
    </ChatFocusable>
  );
}

/**
 * Offline mode: while on, nothing is sent to Claude (local suggestions, no replies). A switch-style tile above
 * the theme toggle; the line under it says whether Claude is reachable at all (no API key → always local).
 */
export function SidebarOfflineToggle({ offline, claudeReady, ...p }: Common & { offline: boolean; claudeReady: boolean | null }) {
  const status = offline ? "Only local suggestions" : claudeReady === false ? "No API key — local suggestions" : "Using Claude";
  return (
    <ChatFocusable target={SB_OFFLINE} enabled={p.enabled} flashKey={p.lastFlash[SB_OFFLINE.id]} radius="rounded-xl" className="mt-2" onActivate={p.onActivate}>
      <button type="button" role="switch" aria-checked={offline} className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-accent">
        <WifiOff className="size-5 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span>Offline mode</span>
          <span className="truncate text-[11px] text-muted-foreground">{status}</span>
        </span>
        <span aria-hidden className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", offline ? "bg-foreground" : "bg-muted-foreground/30")}>
          <span className={cn("absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform duration-200", offline ? "translate-x-[18px]" : "translate-x-0.5")} />
        </span>
      </button>
    </ChatFocusable>
  );
}

/**
 * While replying in an ongoing chat the transcript is out of view, so the sidebar's free space shows the AI's last
 * message for reference. Read-only (not a head target): it fills the gap between the interfaces and the camera
 * card and starts scrolled to the bottom — the end of the reply, where it usually asks or concludes — with a fade
 * at the top where earlier text is cut off. Scroll up to read the rest, with the mouse or with head scroll (it is
 * the head-scroll surface while shown — nothing else claims it while composing). The whole conversation is one
 * "Conversation" field away.
 */
export function SidebarLastReply({ text, active }: { text: string; active: boolean }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  useHeadScrollTarget({ scrollBy: (dy) => boxRef.current?.scrollBy({ top: dy, behavior: "instant" }) }, active);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <section className="mx-3 mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-sidebar-border bg-background animate-in fade-in duration-300" aria-label="Last reply">
      <div className="px-3 pb-1 pt-2.5 text-xs font-medium text-muted-foreground">Last reply</div>
      <div className="relative min-h-0 flex-1">
        <div ref={boxRef} className="h-full overflow-auto whitespace-pre-wrap break-words px-3 pb-3 pt-2 text-[13px] leading-[1.55] text-foreground">{text}</div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-background to-transparent" aria-hidden />
      </div>
    </section>
  );
}
