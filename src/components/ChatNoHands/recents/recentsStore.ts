"use client";

import { useSyncExternalStore } from "react";

/**
 * Local store for the Recents screen: chats (with their messages) and projects, persisted in localStorage.
 * New Chat saves every conversation here when a message is sent; opening a card loads it back.
 * Starts with sample data so the screen has something to show.
 */
export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RecentChat {
  id: string;
  title: string;
  /** epoch ms */
  editedAt: number;
  pinned: boolean;
  /** null = uncategorised */
  projectId: string | null;
  messages: StoredMessage[];
}

export interface Project {
  id: string;
  title: string;
  pinned: boolean;
}

export interface RecentsState {
  chats: RecentChat[];
  projects: Project[];
}

const KEY = "chat-no-hands-recents";
const H = 3600_000;

function sample(): RecentsState {
  const now = Date.now();
  return {
    projects: [
      { id: "p1", title: "Design portfolio", pinned: true },
      { id: "p2", title: "Thesis research", pinned: false },
      { id: "p3", title: "Weekend plans", pinned: false },
    ],
    chats: [
      { id: "c1", title: "Create a website for my design portfolio", editedAt: now - 2 * H, pinned: true, projectId: null, messages: [{ role: "user", content: "Create a website for my design portfolio" }, { role: "assistant", content: "Happy to help. A portfolio site usually needs a home page with a short introduction, a projects section with one page per project, an about page and a way to get in touch. Which projects do you want to show first?" }] },
      { id: "c2", title: "Explain how AI affects creativity", editedAt: now - 26 * H, pinned: false, projectId: null, messages: [{ role: "user", content: "Explain how AI affects creativity" }, { role: "assistant", content: "AI changes creative work in three ways: it lowers the cost of trying ideas, it shifts effort from making toward choosing, and it raises the value of taste and intent. The people who benefit most treat it as a very fast, very literal collaborator." }] },
      { id: "c3", title: "Give me three ideas for a poster", editedAt: now - 3 * 24 * H, pinned: false, projectId: null, messages: [{ role: "user", content: "Give me three ideas for a poster" }, { role: "assistant", content: "1. A single oversized word in a display face, set at an angle.\n2. A photograph cropped so tight it becomes texture.\n3. A grid of small repeated icons with one deliberately broken." }] },
      { id: "c4", title: "Help me write a friendly email", editedAt: now - 6 * 24 * H, pinned: false, projectId: null, messages: [{ role: "user", content: "Help me write a friendly email" }, { role: "assistant", content: "Of course. Who is it to, and what is the one thing you need them to do after reading it?" }] },
      { id: "c5", title: "What is the difference between UX and UI", editedAt: now - 9 * 24 * H, pinned: false, projectId: null, messages: [{ role: "user", content: "What is the difference between UX and UI" }, { role: "assistant", content: "UX is how the whole experience works and feels over time. UI is the visible layer you interact with. Good UI can sit on bad UX, but rarely the other way round." }] },
      { id: "c6", title: "Write a short bio for my portfolio", editedAt: now - 5 * H, pinned: false, projectId: "p1", messages: [{ role: "user", content: "Write a short bio for my portfolio" }, { role: "assistant", content: "Tell me your name, what you design, and one thing you care about in your work, and I will draft three versions in different tones." }] },
      { id: "c7", title: "Summarise these interview notes", editedAt: now - 2 * 24 * H, pinned: false, projectId: "p2", messages: [{ role: "user", content: "Summarise these interview notes" }, { role: "assistant", content: "Paste the notes here and tell me whether you want themes, quotes, or a one-paragraph summary." }] },
    ],
  };
}

let state: RecentsState | null = null;
const listeners = new Set<() => void>();

function load(): RecentsState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RecentsState;
      state = { ...parsed, chats: parsed.chats.map((c) => ({ ...c, messages: c.messages ?? [] })) };
    }
  } catch {}
  return (state ??= sample());
}

function commit(next: RecentsState) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  for (const l of listeners) l();
}

const EMPTY: RecentsState = { chats: [], projects: [] };

export function useRecents(): RecentsState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    load,
    () => EMPTY,
  );
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const recents = {
  pinChat: (id: string) => commit({ ...load(), chats: load().chats.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)) }),
  renameChat: (id: string, title: string) => commit({ ...load(), chats: load().chats.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title, editedAt: Date.now() } : c)) }),
  deleteChat: (id: string) => commit({ ...load(), chats: load().chats.filter((c) => c.id !== id) }),
  moveChat: (id: string, projectId: string | null) => commit({ ...load(), chats: load().chats.map((c) => (c.id === id ? { ...c, projectId } : c)) }),
  pinProject: (id: string) => commit({ ...load(), projects: load().projects.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)) }),
  renameProject: (id: string, title: string) => commit({ ...load(), projects: load().projects.map((p) => (p.id === id ? { ...p, title: title.trim() || p.title } : p)) }),
  /** chats of a deleted project become uncategorised */
  deleteProject: (id: string) => commit({ projects: load().projects.filter((p) => p.id !== id), chats: load().chats.map((c) => (c.projectId === id ? { ...c, projectId: null } : c)) }),
  addProject: (title: string) => commit({ ...load(), projects: [...load().projects, { id: newId(), title: title.trim() || "New project", pinned: false }] }),
  /**
   * Save a conversation from New Chat. Creates the chat on first save (title = first user message), updates
   * its messages and timestamp afterwards. Returns the chat id.
   */
  saveConversation: (id: string | null, messages: StoredMessage[], projectId?: string | null): string => {
    const st = load();
    const existing = id ? st.chats.find((c) => c.id === id) : undefined;
    if (existing) {
      commit({ ...st, chats: st.chats.map((c) => (c.id === id ? { ...c, messages, editedAt: Date.now() } : c)) });
      return existing.id;
    }
    const first = messages.find((m) => m.role === "user")?.content.trim() ?? "New chat";
    const chat: RecentChat = { id: newId(), title: first.length > 80 ? `${first.slice(0, 77)}…` : first, editedAt: Date.now(), pinned: false, projectId: projectId ?? null, messages };
    commit({ ...st, chats: [chat, ...st.chats] });
    return chat.id;
  },
  get: (id: string) => load().chats.find((c) => c.id === id) ?? null,
  getProject: (id: string) => load().projects.find((p) => p.id === id) ?? null,
};

/** pinned first, then most recently edited */
export const sortChats = (chats: RecentChat[]) => [...chats].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.editedAt - a.editedAt);
export const sortProjects = (projects: Project[]) => [...projects].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title));

export function relativeTime(t: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? "yesterday" : `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
