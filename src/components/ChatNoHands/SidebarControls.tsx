"use client";

import { FlaskConical, MessageSquare, Moon, PanelLeft, Sun } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import type { FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ChatFocusable } from "./ChatFocusable";

/*
 * The chat interface's sidebar controls, head-focusable like everything else: the pointer's area is the whole
 * window (see ChatNoHands' root ref), and each control is a tile at least 48px tall so it is comfortable
 * to reach by head. Head confirms and mouse clicks both arrive as SB_* actions — see `sidebarAction`.
 * Pass enabled=false while the sidebar is closed: its controls still have boxes (clipped by the 0-width
 * aside), and must not stay behind as invisible fields.
 */

export type InterfaceId = "lab" | "chat";

const INTERFACES: Array<{ id: InterfaceId; label: string; href: string; icon: React.ReactNode }> = [
  { id: "lab", label: "Input Lab", href: "/", icon: <FlaskConical className="size-5" /> },
  { id: "chat", label: "ISNT", href: "/chat", icon: <MessageSquare className="size-5" /> },
];

const SB_CLOSE: FocusTarget = { id: "sb-close", kind: "button", label: "Close sidebar", action: "SB_CLOSE" };
const SB_OPEN: FocusTarget = { id: "sb-open", kind: "button", label: "Open sidebar", action: "SB_OPEN" };
const SB_THEME: FocusTarget = { id: "sb-theme", kind: "button", label: "Toggle light / dark mode", action: "SB_THEME" };
/** the current interface's entry starts a new chat there (as the old sidebar did); the others navigate */
const interfaceTarget = (i: (typeof INTERFACES)[number], current: InterfaceId): FocusTarget =>
  i.id === current
    ? { id: `sb-go-${i.id}`, kind: "button", label: i.label, action: "SB_NEW_CHAT" }
    : { id: `sb-go-${i.id}`, kind: "button", label: i.label, action: "SB_GO", payload: { href: i.href } };

export interface SidebarHandlers {
  setSidebarOpen: (open: boolean) => void;
  toggleTheme: () => void;
  navigate: (href: string) => void;
  newChat: () => void;
}

/** Runs a sidebar action; returns false for any other action so the caller's own switch can handle it. */
export function sidebarAction(action: string, target: FocusTarget | null, h: SidebarHandlers): boolean {
  switch (action) {
    case "SB_CLOSE": h.setSidebarOpen(false); return true;
    case "SB_OPEN": h.setSidebarOpen(true); return true;
    case "SB_THEME": h.toggleTheme(); return true;
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
