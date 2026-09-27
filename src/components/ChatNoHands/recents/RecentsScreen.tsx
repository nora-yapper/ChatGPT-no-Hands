"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Clock, Folder, FolderInput, FolderPlus, MoreHorizontal, Pencil, Pin, PinOff, SquarePen, Trash2, X } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { pipeline } from "@/pipeline/Pipeline";
import type { ActionEvent, FocusTarget } from "@/types/interaction";
import { cn } from "@/lib/utils";
import { ChatFocusable } from "../ChatFocusable";
import { TilePanel, type TilePanelItem } from "../TilePanel";
import { BASE_COLS, BASE_PLACEMENT, PHRASE_TINT, tint, type Span } from "../spatial";
import { useHeadScrollTarget } from "../useHeadScroll";
import { recents, relativeTime, sortChats, sortProjects, useRecents, type Project, type RecentChat } from "./recentsStore";

/* ───────────── placement ─────────────
 * Overview: one region over the whole block above the tabs (the word area *and* the input-bar rows — head
 * scrolling is hard, so show as many cards as fit). Its columns are a subgrid of the base grid, so the
 * chats | projects split lines up with New Chat's columns; its rows are its own, OVERVIEW_ROWS equal cards.
 * Left: uncategorised chats. Right: the Projects panel — New project first, then the projects, row-major.
 * Opened project: its chats across the word area, three cards per column, with Back / New chat in the bar rows. */
const COL_SPANS = ["1 / 9", "9 / 17", `17 / ${BASE_COLS + 1}`];
const OVERVIEW_ROWS = 4;
const OVERVIEW_REGION: Span = { col: `1 / ${BASE_COLS + 1}`, row: "1 / 15" };
const CHATS_COL = "1 / 9";
const PROJECTS_COL = `9 / ${BASE_COLS + 1}`;
const CARD_ROWS = 3;
const cardSpan = (col: number, row: number): Span => ({ col: COL_SPANS[col], row: `${row * 3 + 1} / ${row * 3 + 4}` });
/** overview chat column: row i of OVERVIEW_ROWS */
const chatSpan = (i: number): Span => ({ col: CHATS_COL, row: `${i + 1} / ${i + 2}` });
/** Projects panel: slot k, row-major over its two columns (so a few projects fill both columns evenly); slot 0 is New project */
const panelSpan = (k: number): Span => ({ col: `${(k % 2) + 1}`, row: `${Math.floor(k / 2) + 1}` });
const PROJECT_SLOTS = OVERVIEW_ROWS * 2 - 1;

/** every project card shares one pastel (the compass phrase colour) */
const PROJECT_TINT = PHRASE_TINT;

const place = (s: Span, extra?: React.CSSProperties): React.CSSProperties => ({ gridColumn: s.col, gridRow: s.row, ...extra });

type Menu = { kind: "chat"; id: string; mode: "menu" | "move" } | { kind: "project"; id: string; mode: "menu" };

const t = (id: string, label: string, action: string, payload?: Record<string, unknown>): FocusTarget => ({ id: `rc-${id}`, kind: "button", label, action, payload });

/**
 * Fit `items` into `slots` card positions. When they do not all fit, the last slot becomes a "more" tile and,
 * once paged, the first slot a "previous" tile; the remaining slots hold cards. Returns what to draw in order.
 */
function paginate<T>(items: T[], slots: number, page: number): { prev: boolean; shown: T[]; more: number } {
  if (items.length <= slots) return { prev: false, shown: items, more: 0 };
  // page 0 has (slots - 1) cards; later pages (slots - 2), because both tiles show
  const first = slots - 1;
  const perPage = slots - 2;
  const start = page === 0 ? 0 : first + (page - 1) * perPage;
  const prev = page > 0;
  const capacity = slots - (prev ? 1 : 0) - 1; // leave room for a possible "more" tile
  const remainingAll = items.length - start;
  if (remainingAll <= capacity + 1) return { prev, shown: items.slice(start), more: 0 }; // everything left fits (no more tile needed)
  return { prev, shown: items.slice(start, start + capacity), more: remainingAll - capacity };
}

function PagerTile({ span, target, enabled, lastFlash, onActivate, direction, label }: { span: Span; target: FocusTarget; enabled: boolean; lastFlash: Record<string, number>; onActivate: (t: FocusTarget) => void; direction: "up" | "down"; label: string }) {
  return (
    <ChatFocusable target={target} enabled={enabled} flashKey={lastFlash[target.id]} radius="rounded-2xl" style={place(span)} onActivate={onActivate}>
      <Button variant="ghost" className="h-full w-full flex-col gap-1.5 rounded-2xl border border-dashed border-border text-[15px] font-normal text-muted-foreground hover:bg-muted">
        {direction === "down" ? <ChevronDown className="size-6" /> : <ChevronUp className="size-6" />} {label}
      </Button>
    </ChatFocusable>
  );
}

export interface RecentsScreenProps {
  enabled: boolean;
  lastFlash: Record<string, number>;
  /** the screen's activation callback (flashes the target); Recents handles its own RC_* actions on top */
  onActivate: (t: FocusTarget) => void;
  /** open a stored conversation in New Chat */
  onOpenChat: (chat: RecentChat) => void;
  /** the chat currently loaded in New Chat, if any */
  currentChatId: string | null;
  /** start a brand-new chat filed under the given project */
  onNewChatInProject: (projectId: string) => void;
}

/**
 * Recents: uncategorised chats in the left column, projects in the two right columns, on the same base
 * grid as New Chat. Every menu button and menu item is a head-selectable field; chats can also be dragged
 * onto a project with the mouse. Actions are prefixed RC_ and handled here, whether they arrive from a
 * confirmed gesture (via the pipeline dispatcher) or a mouse click.
 */
export function RecentsScreen({ enabled, lastFlash, onActivate, onOpenChat, currentChatId, onNewChatInProject }: RecentsScreenProps) {
  const { chats, projects } = useRecents();
  const [menu, setMenu] = useState<Menu | null>(null);
  /** a project opened as a filter: its chats fill the columns, Back returns to the overview */
  const [openProject, setOpenProject] = useState<string | null>(null);
  /** page offsets for the three lists that can overflow */
  const [pages, setPages] = useState({ chats: 0, projects: 0, view: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);

  const act = useCallback(
    (target: FocusTarget | null, action: string) => {
      const id = target?.payload?.id as string | undefined;
      switch (action) {
        case "RC_MENU_CHAT": setMenu(id ? { kind: "chat", id, mode: "menu" } : null); break;
        case "RC_MENU_PROJECT": setMenu(id ? { kind: "project", id, mode: "menu" } : null); break;
        case "RC_CLOSE": setMenu(null); break;
        case "RC_PIN_CHAT": if (id) recents.pinChat(id); setMenu(null); break;
        case "RC_PIN_PROJECT": if (id) recents.pinProject(id); setMenu(null); break;
        case "RC_DELETE_CHAT": if (id) recents.deleteChat(id); setMenu(null); break;
        case "RC_DELETE_PROJECT": if (id) recents.deleteProject(id); setMenu(null); break;
        case "RC_MOVE_START": if (id) setMenu({ kind: "chat", id, mode: "move" }); break;
        case "RC_MOVE_TO": if (id) recents.moveChat(id, (target?.payload?.projectId as string | null) ?? null); setMenu(null); break;
        // the rename keyboard itself is owned by ChatNoHands (it takes over the head pointer); here we just close the menu
        case "RC_RENAME_CHAT": case "RC_RENAME_PROJECT": setMenu(null); break;
        case "RC_NEW_PROJECT": recents.addProject(`Project ${projects.length + 1}`); break;
        case "RC_OPEN_CHAT": { const c = chats.find((x) => x.id === id); if (c) onOpenChat(c); break; }
        case "RC_OPEN_PROJECT": if (id) { setOpenProject(id); setPages((p) => ({ ...p, view: 0 })); } break;
        case "RC_CLOSE_PROJECT": setOpenProject(null); break;
        case "RC_NEW_CHAT_IN_PROJECT": if (id) onNewChatInProject(id); break;
        case "RC_PAGE": {
          const list = target?.payload?.list as "chats" | "projects" | "view";
          const delta = target?.payload?.delta as number;
          setPages((p) => ({ ...p, [list]: Math.max(0, p[list] + delta) }));
          pipeline.recenterGrid();
          break;
        }
      }
    },
    [chats, projects, onOpenChat, onNewChatInProject],
  );

  // gestures arrive through the shared dispatcher; only RC_* actions are ours
  useEffect(() => pipeline.dispatcher.register((a: ActionEvent) => { if (a.action.startsWith("RC_")) act(a.target, a.action); }), [act]);
  const activate = useCallback((target: FocusTarget) => { onActivate(target); act(target, target.action); }, [onActivate, act]);
  useEffect(() => { if (menu) pipeline.recenterGrid(); }, [menu]);
  // the screen's field measurement is keyed to New Chat state; ask it to re-measure when our targets change
  // (it listens for window resize), once immediately and once after the enter animation
  const layoutKey = `${menu?.kind ?? ""}${menu?.id ?? ""}${menu?.mode ?? ""}|${openProject ?? ""}|${pages.chats}${pages.projects}${pages.view}|${chats.length}|${projects.length}|${chats.map((c) => c.projectId).join("")}`;
  useEffect(() => {
    const fire = () => window.dispatchEvent(new Event("resize"));
    fire();
    const t = setTimeout(fire, 300);
    return () => clearTimeout(t);
  }, [layoutKey]);

  // a project that was deleted while open simply falls back to the overview
  const project = openProject ? projects.find((p) => p.id === openProject) ?? null : null;
  const allUncategorised = sortChats(chats.filter((c) => !c.projectId));
  const chatPage = paginate(allUncategorised, OVERVIEW_ROWS, pages.chats);
  const projectPage = paginate(sortProjects(projects), PROJECT_SLOTS, pages.projects);
  const targetsEnabled = enabled && !menu;
  const projectChats = project ? sortChats(chats.filter((c) => c.projectId === project.id)) : [];
  const viewPage = paginate(projectChats, CARD_ROWS * 3, pages.view);
  const pager = (list: "chats" | "projects" | "view", delta: number, label: string) => t(`page-${list}-${delta > 0 ? "next" : "prev"}`, label, "RC_PAGE", { list, delta });
  /** slot index → grid span for a list laid out column-major over `cols` columns starting at column `col0` */
  const slotSpan = (col0: number, i: number) => cardSpan(col0 + Math.floor(i / CARD_ROWS), i % CARD_ROWS);

  // recent-chats list (or a project's chats, once opened): tilting the head down/up pages through it once
  // head scroll is toggled on (triple fast blink) — same RC_PAGE the arrow tiles use, just head-driven
  const scrollStep = useCallback(
    (dir: 1 | -1) => {
      const list: "chats" | "view" = project ? "view" : "chats";
      const page = project ? viewPage : chatPage;
      if ((dir > 0 && page.more <= 0) || (dir < 0 && !page.prev)) return;
      act(pager(list, dir, ""), "RC_PAGE");
    },
    [project, viewPage, chatPage, act],
  );
  useHeadScrollTarget({ step: scrollStep }, targetsEnabled);

  const drop = (projectId: string | null) => {
    if (dragging) recents.moveChat(dragging, projectId);
    setDragging(null);
    setDropOver(null);
  };

  const cardProps = (c: RecentChat) => ({ enabled: targetsEnabled, lastFlash, onActivate: activate, current: c.id === currentChatId, onDragStart: () => setDragging(c.id), onDragEnd: () => { setDragging(null); setDropOver(null); } });

  if (project) {
    // ── project view: its chats across all three columns, Back + info in the bar rows
    const visible = viewPage.shown;
    let slot = viewPage.prev ? 1 : 0;
    return (
      <>
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-composer-border bg-composer px-5 text-sm" style={place(BASE_PLACEMENT.projectBar.info)}>
          <Folder className="size-5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{project.title}</span>
          <span className="shrink-0 text-muted-foreground">· {projectChats.length === 1 ? "1 chat" : `${projectChats.length} chats`}</span>
        </div>
        <ChatFocusable target={t("new-chat-in-project", `New chat in ${project.title}`, "RC_NEW_CHAT_IN_PROJECT", { id: project.id })} enabled={targetsEnabled} flashKey={lastFlash["rc-new-chat-in-project"]} radius="rounded-2xl" style={place(BASE_PLACEMENT.projectBar.newChat)} onActivate={activate}>
          <Button variant="secondary" className="h-full w-full flex-col gap-1.5 rounded-2xl text-[15px] font-normal"><SquarePen className="size-6" /> New chat</Button>
        </ChatFocusable>
        <ChatFocusable target={t("close-project", "Back to all recents", "RC_CLOSE_PROJECT")} enabled={targetsEnabled} flashKey={lastFlash["rc-close-project"]} radius="rounded-2xl" style={place(BASE_PLACEMENT.projectBar.allRecents)} onActivate={activate}>
          <Button variant="secondary" className="h-full w-full flex-col gap-1.5 rounded-2xl text-[15px] font-normal"><ArrowLeft className="size-6" /> All recents</Button>
        </ChatFocusable>
        {viewPage.prev && <PagerTile span={slotSpan(0, 0)} target={pager("view", -1, "Previous")} enabled={targetsEnabled} lastFlash={lastFlash} onActivate={activate} direction="up" label="Previous" />}
        {visible.map((c) => (
          <ChatCard key={c.id} chat={c} span={slotSpan(0, slot++)} {...cardProps(c)} />
        ))}
        {viewPage.more > 0 && <PagerTile span={slotSpan(0, CARD_ROWS * 3 - 1)} target={pager("view", 1, `${viewPage.more} more`)} enabled={targetsEnabled} lastFlash={lastFlash} onActivate={activate} direction="down" label={`${viewPage.more} more`} />}
        {visible.length === 0 && (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground" style={place({ col: `1 / ${BASE_COLS + 1}`, row: "1 / 4" })}>
            This project has no chats yet. Move one here from All recents.
          </div>
        )}
        {menu && <MenuPanel menu={menu} chats={chats} projects={projects} enabled={enabled} lastFlash={lastFlash} onActivate={activate} />}
      </>
    );
  }

  return (
    <>
      {/* same subtle enter as Account (NoHandsScreen switches screens by swapping content) */}
      <div className="grid gap-2 animate-in fade-in duration-300" style={place(OVERVIEW_REGION, { gridTemplateColumns: "subgrid", gridTemplateRows: `repeat(${OVERVIEW_ROWS}, minmax(0, 1fr))` })}>
        {/* left column: uncategorised chats, paged (also a drop target to un-file a chat with the mouse) */}
        {chatPage.prev && <PagerTile span={chatSpan(0)} target={pager("chats", -1, "Previous")} enabled={targetsEnabled} lastFlash={lastFlash} onActivate={activate} direction="up" label="Previous" />}
        {chatPage.shown.map((c, i) => (
          <ChatCard key={c.id} chat={c} span={chatSpan(i + (chatPage.prev ? 1 : 0))} {...cardProps(c)} />
        ))}
        {chatPage.more > 0 && <PagerTile span={chatSpan(OVERVIEW_ROWS - 1)} target={pager("chats", 1, `${chatPage.more} more`)} enabled={targetsEnabled} lastFlash={lastFlash} onActivate={activate} direction="down" label={`${chatPage.more} more chats`} />}
        {allUncategorised.length === 0 && (
          <div className={cn("flex items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground", dropOver === "none" && "border-foreground bg-muted")} style={place(chatSpan(0))} onDragOver={(e) => { e.preventDefault(); setDropOver("none"); }} onDragLeave={() => setDropOver(null)} onDrop={() => drop(null)}>
            No recent chats
          </div>
        )}

        {/* right: the Projects panel — titled once, New project in its first slot, projects paged row-major */}
        <section aria-label="Projects" className="pastel flex min-h-0 flex-col gap-3 rounded-[28px] p-4" style={place({ col: PROJECTS_COL, row: "1 / -1" }, { ["--tint" as string]: tint(PROJECT_TINT) })}>
          <div className="flex h-5 shrink-0 items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
            <Folder className="size-3.5" /> Projects
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3" style={{ gridTemplateRows: `repeat(${OVERVIEW_ROWS}, minmax(0, 1fr))` }}>
            <ChatFocusable target={t("new-project", "New project", "RC_NEW_PROJECT")} enabled={targetsEnabled} flashKey={lastFlash["rc-new-project"]} radius="rounded-xl" style={place(panelSpan(0))} onActivate={activate}>
              <Button variant="ghost" className="h-full w-full flex-col gap-1.5 rounded-xl border border-dashed border-current/25 text-[15px] font-normal hover:bg-transparent"><FolderPlus className="size-6" /> New project</Button>
            </ChatFocusable>
            {projectPage.prev && <PagerTile span={panelSpan(1)} target={pager("projects", -1, "Previous")} enabled={targetsEnabled} lastFlash={lastFlash} onActivate={activate} direction="up" label="Previous" />}
            {projectPage.shown.map((p, i) => (
              <ProjectCard key={p.id} project={p} count={chats.filter((c) => c.projectId === p.id).length} span={panelSpan(1 + i + (projectPage.prev ? 1 : 0))} enabled={targetsEnabled} lastFlash={lastFlash} onActivate={activate} dropOver={dropOver === p.id} dragging={!!dragging} onDragOver={(e) => { e.preventDefault(); setDropOver(p.id); }} onDragLeave={() => setDropOver(null)} onDrop={() => drop(p.id)} />
            ))}
            {projectPage.more > 0 && <PagerTile span={panelSpan(PROJECT_SLOTS)} target={pager("projects", 1, `${projectPage.more} more`)} enabled={targetsEnabled} lastFlash={lastFlash} onActivate={activate} direction="down" label={`${projectPage.more} more projects`} />}
          </div>
        </section>
      </div>

      {menu && <MenuPanel menu={menu} chats={chats} projects={projects} enabled={enabled} lastFlash={lastFlash} onActivate={activate} />}
    </>
  );
}

/* ───────────── cards ───────────── */

interface CardCommon {
  span: Span;
  enabled: boolean;
  lastFlash: Record<string, number>;
  onActivate: (t: FocusTarget) => void;
}

/** A chat is a sheet: white, hairline, regular weight, title + time. The body opens it; the right column is its menu. */
function ChatCard({ chat, span, enabled, lastFlash, onActivate, onDragStart, onDragEnd, current }: { chat: RecentChat; current: boolean; onDragStart: () => void; onDragEnd: () => void } & CardCommon) {
  const menuTarget = t(`chat-${chat.id}-menu`, `Menu for ${chat.title}`, "RC_MENU_CHAT", { id: chat.id });
  const openTarget = t(`chat-${chat.id}-open`, `Open ${chat.title}`, "RC_OPEN_CHAT", { id: chat.id });
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", chat.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      className={cn("flex h-full min-w-0 items-stretch overflow-hidden rounded-xl bg-background ring-1 cursor-grab active:cursor-grabbing", current ? "ring-2 ring-foreground/40" : "ring-border")}
      style={place(span)}
    >
      <ChatFocusable target={openTarget} enabled={enabled} flashKey={lastFlash[openTarget.id]} radius="rounded-none" className="flex min-w-0 flex-1" onActivate={onActivate}>
        <button type="button" aria-label={openTarget.label} className="flex h-full w-full min-w-0 flex-col justify-center gap-1.5 px-4 py-2 text-left hover:bg-muted/60">
          <span className="line-clamp-2 text-[15px] leading-snug">{chat.title}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {chat.pinned && <Pin className="size-3" />}
            {current && <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-medium text-background">Open</span>}
            <Clock className="size-3" /> {relativeTime(chat.editedAt)}
          </span>
        </button>
      </ChatFocusable>
      <ChatFocusable target={menuTarget} enabled={enabled} flashKey={lastFlash[menuTarget.id]} radius="rounded-none" className="w-14 shrink-0 border-l border-border" onActivate={onActivate}>
        <Button variant="ghost" aria-label={menuTarget.label} className="h-full w-full rounded-none text-muted-foreground hover:bg-muted"><MoreHorizontal className="size-5" /></Button>
      </ChatFocusable>
    </div>
  );
}

/**
 * A project is a sheet sitting on the shared "Projects" panel: white, hairline, a folder glyph and bold
 * title, and how many chats it holds (not which ones — the panel is a nav target, not a preview). Same
 * shape as a chat card; the menu column is the field.
 */
function ProjectCard({ project, count, span, enabled, lastFlash, onActivate, dropOver, dragging, onDragOver, onDragLeave, onDrop }: { project: Project; count: number; dropOver: boolean; dragging: boolean; onDragOver: React.DragEventHandler; onDragLeave: () => void; onDrop: () => void } & CardCommon) {
  const menuTarget = t(`project-${project.id}-menu`, `Menu for ${project.title}`, "RC_MENU_PROJECT", { id: project.id });
  const openTarget = t(`project-${project.id}-open`, `Open ${project.title}`, "RC_OPEN_PROJECT", { id: project.id });
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      // same surface/text tokens as a chat card, so it follows the theme (dark sheet on the dark pastel panel)
      className={cn("flex h-full min-w-0 items-stretch overflow-hidden rounded-xl bg-background text-foreground ring-1 transition-transform", dropOver ? "scale-[1.02] ring-2 ring-foreground" : dragging ? "ring-2 ring-dashed ring-foreground/30" : "ring-border")}
      style={place(span)}
    >
      <ChatFocusable target={openTarget} enabled={enabled} flashKey={lastFlash[openTarget.id]} radius="rounded-none" className="flex min-w-0 flex-1" onActivate={onActivate}>
        <button type="button" aria-label={openTarget.label} className="flex h-full w-full min-w-0 flex-col justify-center gap-2 px-4 py-2 text-left hover:bg-muted/60">
          <div className="flex items-center gap-1.5">
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            {project.pinned && <Pin className="size-3.5 shrink-0 text-muted-foreground" />}
            <div className="truncate text-[16px] font-semibold tracking-[-0.01em]">{project.title}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {count === 0 ? (dragging ? "Drop a chat here" : "Empty") : count === 1 ? "1 chat" : `${count} chats`}
          </div>
        </button>
      </ChatFocusable>
      <ChatFocusable target={menuTarget} enabled={enabled} flashKey={lastFlash[menuTarget.id]} radius="rounded-none" className="w-14 shrink-0 border-l border-border" onActivate={onActivate}>
        <Button variant="ghost" aria-label={menuTarget.label} className="h-full w-full rounded-none text-muted-foreground hover:bg-muted"><MoreHorizontal className="size-5" /></Button>
      </ChatFocusable>
    </div>
  );
}

/* ───────────── dropdown menu ─────────────
 * Rendered as a panel over the projects area on the same base grid, so every item is a full-size field.
 * Chat menu: Pin · Rename · Delete chat · Move to project. Project menu: Pin · Rename · Delete. */

function MenuPanel({ menu, chats, projects, enabled, lastFlash, onActivate }: { menu: Menu; chats: RecentChat[]; projects: Project[]; enabled: boolean; lastFlash: Record<string, number>; onActivate: (t: FocusTarget) => void }) {
  const chat = menu.kind === "chat" ? chats.find((c) => c.id === menu.id) : undefined;
  const project = menu.kind === "project" ? projects.find((p) => p.id === menu.id) : undefined;
  const title = chat?.title ?? project?.title ?? "";
  const id = menu.id;

  let items: TilePanelItem[] = [];
  if (menu.kind === "chat" && menu.mode === "menu") {
    items = [
      { target: t(`m-pin`, chat?.pinned ? "Unpin" : "Pin", "RC_PIN_CHAT", { id }), icon: chat?.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />, label: chat?.pinned ? "Unpin" : "Pin" },
      { target: t(`m-rename`, "Rename", "RC_RENAME_CHAT", { id }), icon: <Pencil className="size-5" />, label: "Rename" },
      { target: t(`m-delete`, "Delete chat", "RC_DELETE_CHAT", { id }), icon: <Trash2 className="size-5" />, label: "Delete chat", danger: true },
      { target: t(`m-move`, "Move to project", "RC_MOVE_START", { id }), icon: <FolderInput className="size-5" />, label: "Move to project" },
    ];
  } else if (menu.kind === "chat") {
    items = [
      ...sortProjects(projects).map((p) => ({ target: t(`m-move-${p.id}`, p.title, "RC_MOVE_TO", { id, projectId: p.id }), icon: <FolderInput className="size-5" />, label: p.title })),
      { target: t(`m-move-none`, "No project", "RC_MOVE_TO", { id, projectId: null }), icon: <X className="size-5" />, label: "No project" },
    ];
  } else {
    items = [
      { target: t(`m-pin`, project?.pinned ? "Unpin" : "Pin", "RC_PIN_PROJECT", { id }), icon: project?.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />, label: project?.pinned ? "Unpin" : "Pin" },
      { target: t(`m-rename`, "Rename", "RC_RENAME_PROJECT", { id }), icon: <Pencil className="size-5" />, label: "Rename" },
      { target: t(`m-delete`, "Delete", "RC_DELETE_PROJECT", { id }), icon: <Trash2 className="size-5" />, label: "Delete", danger: true },
    ];
  }
  return (
    <TilePanel
      title={menu.mode === "move" ? `Move “${title}” to` : title}
      items={items}
      close={t("m-close", "Close menu", "RC_CLOSE")}
      enabled={enabled}
      lastFlash={lastFlash}
      onActivate={onActivate}
      style={place({ col: PROJECTS_COL, row: OVERVIEW_REGION.row })}
    />
  );
}
