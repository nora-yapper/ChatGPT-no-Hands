"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, Crosshair, VenetianMask } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import { Separator } from "@/components/shadcn/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/shadcn/tooltip";
import { CalibrationOverlay } from "@/components/Calibration/CalibrationOverlay";
import { SettingsPanel } from "@/components/Settings/SettingsPanel";
import { LandmarkOverlay } from "@/components/CameraPanel/LandmarkOverlay";
import { useCameraTracking } from "@/pipeline/useCameraTracking";
import { pipeline } from "@/pipeline/Pipeline";
import { labStore, useLab } from "@/store/labStore";
import { settingsStore, useSettings } from "@/store/settingsStore";
import type { ActionEvent, FocusMode, FocusTarget } from "@/types/interaction";
import { askAssistant, newMessage, type ChatMessage } from "@/chat/assistant";
import { fetchPredictions } from "@/chat/predictions";
import { fallbackPredictions, type Predictions } from "@/chat/predictionRules";
import { buildPrompt, pushSegment, undoSegment, type Segment } from "@/chat/promptState";
import { cn } from "@/lib/utils";
import { NoHandsScreen } from "./NoHandsScreen";
import { SidebarCloseButton, SidebarInterfaces, SidebarOpenButton, SidebarToggles, sidebarAction } from "./SidebarControls";
import { TransitIndicator } from "./TransitIndicator";
import { KeyboardModal } from "./KeyboardModal";
import { RenameKeyboardModal } from "./RenameKeyboardModal";
import { useHeadScrollTarget } from "./useHeadScroll";
import type { ScrollToggleGesture } from "@/gestures/scrollToggleDetector";
import type { Phase, Screen } from "./spatial";
import { recents, type RecentChat } from "./recents/recentsStore";

type Theme = "light" | "dark";
const THEME_KEY = "chat-no-hands-theme";
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    return saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch {
    return "light";
  }
}

/** a prediction result for one prompt */
interface Fetched {
  p: Predictions;
  source: "model" | "fallback";
}

/** everything the shared on-screen keyboard can be pre-loaded to edit */
type RenameKind = "chat" | "project" | "account-name" | "account-email";
const RENAME_TITLES: Record<RenameKind, string> = {
  chat: "Rename chat",
  project: "Rename project",
  "account-name": "Edit name",
  "account-email": "Edit email",
};

const SCROLL_TOGGLE_HINT: Record<ScrollToggleGesture, string> = {
  BROW_RAISE_BOTH: "Raise both eyebrows and hold for a beat",
  MOUTH_HOLD: "Open your mouth and hold for a beat",
  BLINK_BURST: "Blink fast three times",
};

function IconButton({ label, onClick, children, active, disabled, className }: { label: string; onClick?: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label={label} onClick={onClick} disabled={disabled} className={cn("rounded-lg text-foreground", active && "bg-accent", className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function ChatNoHands() {
  const { videoRef, start, stop } = useCameraTracking();
  const router = useRouter();
  /** the head pointer's area: the whole window, so the cursor can glide into the sidebar */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lab = useLab();
  const settings = useSettings();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // conversation
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** id of this conversation in Recents once it has been saved (first send) or opened from there */
  const [chatId, setChatId] = useState<string | null>(null);
  /** while on, `send` never writes to Recents — the conversation lives only in this session's state */
  const [incognito, setIncognito] = useState(false);
  const [sending, setSending] = useState(false);
  // spatial prompt construction
  const [screen, setScreen] = useState<Screen>("new");
  // §22: the prompt is derived from the segments the user chose or typed; undo drops the last one.
  const [segments, setSegments] = useState<Segment[]>([]);
  const prompt = buildPrompt(segments);
  /** prediction results by prompt (this session), so Back restores a previous compass instantly */
  const [results, setResults] = useState<Record<string, Fetched>>({});

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  /** Recents: the chat/project being renamed via the on-screen keyboard, if any — also reused to edit an Account field */
  const [renameTarget, setRenameTarget] = useState<{ kind: RenameKind; id: string; value: string } | null>(null);
  /** the main screen and sidebar own the head pointer unless a keyboard modal has taken it over */
  const headEnabled = !keyboardOpen && !renameTarget;
  const renameRef = useRef(renameTarget);
  useEffect(() => { renameRef.current = renameTarget; }, [renameTarget]);
  // Account: a prototype identity, editable through the same on-screen keyboard as chat/project renaming
  const [accountName, setAccountName] = useState("Nora Miskulin");
  const [accountEmail, setAccountEmail] = useState("nora.miskulin@gmail.com");
  const [expanded, setExpanded] = useState(false);
  /** false once a message has been sent: the composer collapses and the conversation is read; Reply reopens it */
  const [composing, setComposing] = useState(true);
  /** project a brand-new chat should be filed under on its first send (set by "New chat" from within a project) */
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const pendingProjectRef = useRef(pendingProjectId);
  useEffect(() => { pendingProjectRef.current = pendingProjectId; }, [pendingProjectId]);
  const [kbBuffer, setKbBuffer] = useState("");
  const [lastFlash, setLastFlash] = useState<Record<string, number>>({});
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const phase: Phase = prompt ? "predict" : "starters";

  const camOn = lab.camera.status === "active";
  const trackingOn = lab.tracking.status === "running" && lab.quality.faceDetected;

  useEffect(() => {
    settingsStore.hydrate();
    (window as unknown as { __inputLab: unknown }).__inputLab = { labStore, settingsStore, pipeline };
  }, []);

  // This interface is designed around Grid Glide: switch to it while here, restore the lab's mode on leave.
  useEffect(() => {
    const previous: FocusMode = settingsStore.get().focusMode;
    if (previous !== "grid") settingsStore.set({ focusMode: "grid" });
    return () => {
      if (previous !== "grid") settingsStore.set({ focusMode: previous });
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // ── predictions: always from the COMPLETE prompt ────────────────────────────────────────
  const wantPredictions = !!prompt && screen === "new";
  const current = wantPredictions ? results[prompt] : undefined;
  const predictions: Predictions | null = current?.p ?? null;
  const predictionSource = current?.source ?? null;
  const predicting = wantPredictions && !current;
  useEffect(() => {
    if (!wantPredictions || current) return;
    const ctrl = new AbortController();
    fetchPredictions(prompt, ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setResults((m) => ({ ...m, [prompt]: { p: { words: r.words, phrases: r.phrases }, source: r.source } }));
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.warn("[predict]", err);
        setResults((m) => ({ ...m, [prompt]: { p: fallbackPredictions(prompt), source: "fallback" } }));
      });
    return () => ctrl.abort();
  }, [prompt, wantPredictions, current]);

  const promptRef = useRef(prompt);
  const chatIdRef = useRef(chatId);
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);
  const incognitoRef = useRef(incognito);
  useEffect(() => { incognitoRef.current = incognito; }, [incognito]);
  const messagesRef = useRef(messages);
  const sendingRef = useRef(sending);
  const kbRef = useRef(kbBuffer);
  useEffect(() => { promptRef.current = prompt; }, [prompt]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { sendingRef.current = sending; }, [sending]);
  useEffect(() => { kbRef.current = kbBuffer; }, [kbBuffer]);

  const pick = useCallback((segment: Segment) => {
    setSegments((s) => pushSegment(s, segment));
    pipeline.recenterGrid(); // the cursor returns to the current-text field; the compass refills around it
  }, []);

  /** §21: remove only the most recent segment; predictions for the restored prompt come from the cache or are regenerated. */
  const undo = useCallback(() => {
    setSegments((s) => {
      const next = undoSegment(s);
      if (!next.length) setExpanded(false);
      return next;
    });
    pipeline.recenterGrid();
  }, []);

  const send = useCallback(async () => {
    const text = promptRef.current.trim();
    if (!text || sendingRef.current) return;
    const history = [...messagesRef.current, newMessage("user", text)];
    setMessages(history);
    setSegments([]);
    setExpanded(false);
    setComposing(false); // collapse the composer: the user now expects the answer
    setSending(true);
    // save into Recents: created on the first send, updated afterwards — skipped entirely for an incognito
    // chat, which never gets an id and so never appears in Recents or under any project
    const stored = (ms: ChatMessage[]) => ms.map(({ role, content }) => ({ role, content }));
    const id = incognitoRef.current
      ? null
      : recents.saveConversation(chatIdRef.current, stored(history), chatIdRef.current ? undefined : pendingProjectRef.current);
    if (id) {
      chatIdRef.current = id;
      setChatId(id);
    }
    setPendingProjectId(null);
    try {
      const reply = await askAssistant(history);
      const full = [...history, newMessage("assistant", reply)];
      setMessages(full);
      if (id) recents.saveConversation(id, stored(full));
    } catch (err) {
      const full = [...history, newMessage("assistant", `Request failed: ${String(err)}`)];
      setMessages(full);
      if (id) recents.saveConversation(id, stored(full));
    } finally {
      setSending(false);
    }
  }, []);

  /** Open a stored conversation from Recents in New Chat and continue it there. */
  const openChat = useCallback((chat: RecentChat) => {
    setMessages(chat.messages.map((m) => newMessage(m.role, m.content)));
    setChatId(chat.id);
    setIncognito(false); // a stored chat is, by definition, not incognito
    setSegments([]);
    setExpanded(false);
    setComposing(false); // opened conversations start in reading mode
    setKeyboardOpen(false);
    setKbBuffer("");
    setRenameTarget(null);
    setScreen("new");
    pipeline.recenterGrid();
  }, []);

  const newChat = useCallback(() => {
    setMessages([]);
    setChatId(null);
    setIncognito(false);
    setPendingProjectId(null);
    setSegments([]);
    setExpanded(false);
    setComposing(true);
    setScreen("new");
    setKeyboardOpen(false);
    setKbBuffer("");
    setRenameTarget(null);
  }, []);

  /** Start a brand-new chat that will be filed under `projectId` once it is first sent. */
  const newChatInProject = useCallback((projectId: string) => {
    setMessages([]);
    setChatId(null);
    setIncognito(false); // a chat filed under a project has to be saved to be filed at all
    setPendingProjectId(projectId);
    setSegments([]);
    setExpanded(false);
    setComposing(true);
    setScreen("new");
    setKeyboardOpen(false);
    setKbBuffer("");
    setRenameTarget(null);
    pipeline.recenterGrid();
  }, []);

  /** Toggling incognito always starts a brand-new chat — carrying an existing (possibly already-saved)
   * conversation across the boundary would be confusing, so it behaves like "New chat" plus the flag flip. */
  const toggleIncognito = useCallback(() => {
    setMessages([]);
    setChatId(null);
    setPendingProjectId(null);
    setSegments([]);
    setExpanded(false);
    setComposing(true);
    setScreen("new");
    setKeyboardOpen(false);
    setKbBuffer("");
    setRenameTarget(null);
    setIncognito((v) => !v);
  }, []);

  const closeKeyboard = useCallback((commit: boolean) => {
    const typed = kbRef.current.trim();
    setKeyboardOpen(false);
    setKbBuffer("");
    if (commit && typed) pick({ text: typed, source: "keyboard", type: "manual" }); // §20: manual input is authoritative — appended verbatim, then re-predicted
    else pipeline.recenterGrid();
  }, [pick]);

  const closeRename = useCallback((commit: boolean) => {
    const target = renameRef.current;
    setRenameTarget(null);
    if (commit && target) {
      const value = target.value.trim();
      if (value) {
        switch (target.kind) {
          case "chat": recents.renameChat(target.id, value); break;
          case "project": recents.renameProject(target.id, value); break;
          case "account-name": setAccountName(value); break;
          case "account-email": setAccountEmail(value); break;
        }
      }
    }
    pipeline.recenterGrid();
  }, []);

  /** Every GUI action, whether it came from a confirmed gesture or a mouse click on the same control. */
  const act = useCallback(
    (target: FocusTarget | null, action: string, timestamp = performance.now()) => {
      switch (action) {
        case "PICK": {
          const text = target?.payload?.text as string;
          const slot = target?.payload?.slot as string | undefined;
          const type: Segment["type"] = !slot ? "starter" : ["n", "e", "s", "w"].includes(slot) ? "phrase" : "word";
          pick({ text, source: "prediction", type });
          break;
        }
        case "UNDO": undo(); break;
        case "TOGGLE_EXPAND": setExpanded((e) => !e); break;
        case "COMPOSE": setComposing(true); pipeline.recenterGrid(); break;
        case "READ": setComposing(false); pipeline.recenterGrid(); break;
        case "SCROLL_UP": transcriptRef.current?.scrollBy({ top: -transcriptRef.current.clientHeight * 0.7, behavior: "smooth" }); break;
        case "SCROLL_DOWN": transcriptRef.current?.scrollBy({ top: transcriptRef.current.clientHeight * 0.7, behavior: "smooth" }); break;
        case "OPEN_KEYBOARD": setKbBuffer(""); setKeyboardOpen(true); setExpanded(false); break;
        case "SEND": void send(); break;
        case "NAV": {
          const s = target?.payload?.screen as Screen;
          // "New chat" always starts fresh, even over an ongoing (unsent-draft or mid-conversation) chat —
          // to continue one instead, the user goes through Recents and opens it from there.
          if (s === "new") newChat();
          else setScreen(s);
          pipeline.recenterGrid();
          break;
        }
        case "KB_TYPE": setKbBuffer((b) => b + (target?.payload?.char as string)); break;
        case "KB_SPACE": setKbBuffer((b) => (b.endsWith(" ") || !b ? b : b + " ")); break;
        case "KB_BACKSPACE": setKbBuffer((b) => b.slice(0, -1)); break;
        case "KB_CANCEL": closeKeyboard(false); break;
        case "KB_CONFIRM": closeKeyboard(true); break;
        // Recents: rename a chat or project with the same on-screen keyboard, pre-loaded with its current name
        case "RC_RENAME_CHAT": { const id = target?.payload?.id as string | undefined; const c = id ? recents.get(id) : null; if (c) setRenameTarget({ kind: "chat", id: c.id, value: c.title }); break; }
        case "RC_RENAME_PROJECT": { const id = target?.payload?.id as string | undefined; const p = id ? recents.getProject(id) : null; if (p) setRenameTarget({ kind: "project", id: p.id, value: p.title }); break; }
        case "RC_RENAME_TYPE": setRenameTarget((r) => (r ? { ...r, value: r.value + (target?.payload?.char as string) } : r)); break;
        case "RC_RENAME_SPACE": setRenameTarget((r) => (r ? { ...r, value: r.value.endsWith(" ") || !r.value ? r.value : r.value + " " } : r)); break;
        case "RC_RENAME_BACKSPACE": setRenameTarget((r) => (r ? { ...r, value: r.value.slice(0, -1) } : r)); break;
        case "RC_RENAME_CLEAR": setRenameTarget((r) => (r ? { ...r, value: "" } : r)); break;
        case "RC_RENAME_CANCEL": closeRename(false); break;
        case "RC_RENAME_DONE": closeRename(true); break;
        // Account: name/email edited through the same on-screen keyboard, pre-loaded with the current value
        case "ACCOUNT_EDIT_NAME": setRenameTarget({ kind: "account-name", id: "", value: accountName }); break;
        case "ACCOUNT_EDIT_EMAIL": setRenameTarget({ kind: "account-email", id: "", value: accountEmail }); break;
        case "LOG_OUT": break; // not part of this prototype
        default:
          sidebarAction(action, target, { setSidebarOpen, toggleTheme, toggleSettings: () => setSettingsOpen((o) => !o), navigate: (href) => router.push(href), newChat });
      }
      if (target) setLastFlash((f) => ({ ...f, [target.id]: timestamp }));
    },
    [pick, undo, send, closeKeyboard, closeRename, newChat, accountName, accountEmail, toggleTheme, router],
  );

  const handleAction = useCallback((a: ActionEvent) => act(a.target, a.action, a.timestamp), [act]);
  useEffect(() => pipeline.dispatcher.register(handleAction), [handleAction]);
  const onActivate = useCallback((t: FocusTarget) => act(t, t.action), [act]);

  // physical keyboard: opens the keyboard escape hatch and types into it (testing / accessibility fallback)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey || screen !== "new") return;
      const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (!keyboardOpen) {
        if (onControl) return; // Tab/Enter/Space operate the focused control normally (§37)
        if (e.key === "Enter") { e.preventDefault(); void send(); return; }
        if (e.key === "Backspace") { undo(); return; }
        if (e.key.length === 1 && e.key !== " ") { setKbBuffer(e.key); setKeyboardOpen(true); }
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); closeKeyboard(true); }
      else if (e.key === "Escape") closeKeyboard(false);
      else if (e.key === "Backspace") setKbBuffer((b) => b.slice(0, -1));
      else if (e.key.length === 1) setKbBuffer((b) => b + e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardOpen, screen, send, undo, closeKeyboard]);

  const stateLabel = lab.interaction.state.replace("_", " ").toLowerCase();
  const focusLabel = lab.interaction.armedTarget?.label ?? lab.interaction.focusTarget?.label;
  const cameraProblem = lab.camera.status === "denied" || lab.camera.status === "error" || lab.camera.status === "unavailable";
  const hasTranscript = messages.length > 0 || sending;

  // reading mode (an ongoing conversation, composer collapsed): once head scroll is toggled on, tilting the
  // head down/up scrolls the transcript at a speed proportional to how far it's tilted
  const reading = screen === "new" && hasTranscript && !composing;
  const scrollTranscript = useCallback((deltaPx: number) => {
    const el = transcriptRef.current;
    if (!el) return;
    const top = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + deltaPx));
    // "instant", not the default: the transcript has `scroll-behavior: smooth` for the Up/Down buttons, but a
    // continuous per-frame scrollTop assignment under that CSS would keep re-triggering the browser's own ~300ms
    // ease — fighting itself into a stutter. We already are the animation (one small step per tracking frame).
    el.scrollTo({ top, behavior: "instant" });
  }, []);
  useHeadScrollTarget({ scrollBy: scrollTranscript }, reading && !keyboardOpen && !renameTarget);

  return (
    <TooltipProvider delayDuration={300}>
      <div ref={rootRef} className={cn("chat-root relative flex h-screen text-[15px]", theme === "dark" && "dark")}>
        {/* the head pointer's in-transit dot, over the whole window (the pointer's area); a modal draws its own */}
        {headEnabled && <TransitIndicator />}
        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside className={cn("flex shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200", sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden")}>
          <div className="flex h-16 items-center px-3">
            <SidebarCloseButton enabled={headEnabled && sidebarOpen} lastFlash={lastFlash} onActivate={onActivate} />
          </div>
          <SidebarInterfaces current="chat" enabled={headEnabled && sidebarOpen} lastFlash={lastFlash} onActivate={onActivate} />

          <div className="flex-1" />

          <div className="px-3 pb-3">
            <div className="rounded-2xl border border-sidebar-border bg-background p-2">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" style={{ transform: settings.mirror ? "scaleX(-1)" : "none" }} />
                <LandmarkOverlay />
                {!camOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                    <CameraOff className="size-5" />
                    {lab.camera.status === "requesting" ? "Requesting…" : "Camera off"}
                  </div>
                )}
                {camOn && lab.tracking.status === "loading" && <div className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-center text-[11px] text-muted-foreground">Loading face model…</div>}
                {lab.tracking.status === "error" && <div className="absolute inset-0 overflow-auto bg-background/90 p-2 text-[11px] leading-snug text-destructive">{lab.tracking.message}</div>}
              </div>
              <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", trackingOn ? "bg-foreground" : "bg-muted-foreground/40")} />
                  {trackingOn ? "Tracking" : camOn ? "No face" : "Idle"}
                </span>
                <span>{settings.calibration ? "Calibrated" : "Not calibrated"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {!camOn ? (
                  <Button size="sm" onClick={start} disabled={lab.camera.status === "requesting"} className="rounded-lg gap-1.5"><Camera className="size-3.5" /> Start</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={stop} className="rounded-lg gap-1.5"><CameraOff className="size-3.5" /> Stop</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { pipeline.startCalibration(); pipeline.recenterGrid(); }} disabled={!trackingOn} className="rounded-lg gap-1.5"><Crosshair className="size-3.5" /> Calibrate</Button>
              </div>
              {cameraProblem && <div className="mt-2 px-1 text-[11px] leading-snug text-destructive">{lab.camera.message}</div>}
            </div>
            <SidebarToggles theme={theme} settingsOpen={settingsOpen} enabled={headEnabled && sidebarOpen} lastFlash={lastFlash} onActivate={onActivate} />
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────────── */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-14 shrink-0 items-center justify-between px-3">
            <div className="flex items-center gap-1">
              {!sidebarOpen && <SidebarOpenButton enabled={headEnabled} lastFlash={lastFlash} onActivate={onActivate} />}
              {/* ISNT — Ima Slike Nema Tona */}
              <div className="px-2.5 text-[18px] font-medium text-foreground">ISNT</div>
            </div>
            <div className="flex items-center gap-2">
              {predictionSource === "fallback" && prompt && (
                <Badge variant="outline" className="h-7 rounded-full border-border px-2.5 text-xs font-normal text-muted-foreground">offline suggestions</Badge>
              )}
              {incognito && (
                <Badge variant="outline" className="h-7 rounded-full border-border px-2.5 text-xs font-normal text-muted-foreground">Temporary chat — not saved</Badge>
              )}
              {lab.headScroll.active && (
                <Badge variant="outline" className="h-7 gap-1.5 rounded-full border-border px-2.5 text-xs font-normal text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-foreground" />
                  Head scroll {lab.headScroll.direction === 1 ? "↓" : lab.headScroll.direction === -1 ? "↑" : "on"}
                </Badge>
              )}
              <Badge variant="outline" className="h-7 gap-1.5 rounded-full border-border px-2.5 text-xs font-normal text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", lab.interaction.state === "ARMED" || lab.interaction.state === "CONFIRMING" ? "bg-foreground" : "bg-muted-foreground/50")} />
                {stateLabel}{focusLabel ? ` · ${focusLabel}` : ""}
              </Badge>
              <IconButton
                label={incognito ? "Turn off temporary chat" : "Temporary chat — won't be saved to Recents"}
                active={incognito}
                onClick={toggleIncognito}
              >
                <VenetianMask className="size-5" />
              </IconButton>
            </div>
          </header>

          {!hasTranscript && screen === "new" && phase === "starters" && (
            <div className="flex shrink-0 items-end justify-center pb-2 pt-6">
              <h1 className="text-[28px] font-medium tracking-[-0.01em]">What can I help with?</h1>
            </div>
          )}

          <NoHandsScreen
            screen={screen}
            phase={phase}
            prompt={prompt}
            predictions={predictions}
            loading={predicting}
            sending={sending}
            canUndo={segments.length > 0}
            expanded={expanded}
            enabled={headEnabled}
            areaRef={rootRef}
            areaKey={`${sidebarOpen}|${settingsOpen}|${theme}`}
            lastFlash={lastFlash}
            onActivate={onActivate}
            mode={hasTranscript && !composing ? "read" : "compose"}
            messages={messages}
            transcriptRef={transcriptRef}
            firstStarter={segments[0]?.type === "starter" ? segments[0].text : null}
            firstPickId={segments[0]?.at ?? 0}
            onOpenChat={openChat}
            onNewChatInProject={newChatInProject}
            currentChatId={chatId}
            accountName={accountName}
            accountEmail={accountEmail}
          />

          <p className="shrink-0 pb-6 text-center text-xs text-muted-foreground">
            {camOn && !settings.calibration
              ? "Not calibrated — press Calibrate in the sidebar for accurate head pointing."
              : `Move your head to glide, stop on a field to focus it, then long‑blink or nod to confirm. ${SCROLL_TOGGLE_HINT[settings.scrollToggleGesture]} to toggle head-tilt scrolling. Camera frames never leave this browser.`}
          </p>

          {keyboardOpen && <KeyboardModal buffer={kbBuffer} prompt={prompt} lastFlash={lastFlash} onActivate={onActivate} />}
          {renameTarget && <RenameKeyboardModal title={RENAME_TITLES[renameTarget.kind]} value={renameTarget.value} lastFlash={lastFlash} onActivate={onActivate} />}
        </main>

        {settingsOpen && (
          <aside className="w-80 shrink-0 overflow-auto border-l border-border bg-lab-panel p-3 text-lab-fg" style={{ colorScheme: "dark", ["--lab-accent" as string]: "#22d3ee", ["--lab-border" as string]: "#22303c" }}>
            <div className="mb-2 flex items-center justify-between">
              <div className="font-mono text-[11px] font-semibold tracking-[0.18em] text-lab-dim">SETTINGS · live</div>
              <button onClick={() => setSettingsOpen(false)} className="font-mono text-[11px] text-lab-dim hover:text-lab-fg">CLOSE</button>
            </div>
            <Separator className="mb-2 bg-lab-border" />
            <SettingsPanel />
          </aside>
        )}
        <CalibrationOverlay />
      </div>
    </TooltipProvider>
  );
}
