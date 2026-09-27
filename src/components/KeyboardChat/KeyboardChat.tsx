"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Camera, CameraOff, ChevronDown, Crosshair, FlaskConical, Keyboard, MessageSquare, Moon, PanelLeft, Settings2, Sun } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import { Separator } from "@/components/shadcn/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/shadcn/tooltip";
import { CalibrationOverlay } from "@/components/Calibration/CalibrationOverlay";
import { SettingsPanel } from "@/components/Settings/SettingsPanel";
import { LandmarkOverlay } from "@/components/CameraPanel/LandmarkOverlay";
import { ChatTranscript } from "@/components/ChatNoHands/ChatTranscript";
import { TailText } from "@/components/ChatNoHands/TailText";
import { useCameraTracking } from "@/pipeline/useCameraTracking";
import { pipeline } from "@/pipeline/Pipeline";
import { labStore, useLab } from "@/store/labStore";
import { settingsStore, useSettings } from "@/store/settingsStore";
import type { ActionEvent, FocusTarget } from "@/types/interaction";
import { askAssistant, newMessage, type ChatMessage } from "@/chat/assistant";
import { cn } from "@/lib/utils";
import { KeyboardChatControls } from "./KeyboardChatControls";

type Theme = "light" | "dark";
const THEME_KEY = "chat-no-hands-theme";

/** Capitalise the first letter of the draft and of every sentence. */
function appendChar(draft: string, ch: string) {
  const trimmed = draft.trimEnd();
  const sentenceStart = trimmed.length === 0 || /[.?!]$/.test(trimmed);
  return draft + (sentenceStart ? ch.toUpperCase() : ch);
}

function IconButton({ label, onClick, children, active }: { label: string; onClick?: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label={label} onClick={onClick} className={cn("rounded-lg text-foreground", active && "bg-accent")}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The original ChatGPT no Hands interface: a chat with a permanent head-controlled keyboard under the composer. */
export default function KeyboardChat() {
  const { videoRef, start, stop } = useCameraTracking();
  const lab = useLab();
  const settings = useSettings();
  const [theme, setTheme] = useState<Theme>("light");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [lastFlash, setLastFlash] = useState<Record<string, number>>({});
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const camOn = lab.camera.status === "active";
  const trackingOn = lab.tracking.status === "running" && lab.quality.faceDetected;

  useEffect(() => {
    settingsStore.hydrate();
    (window as unknown as { __inputLab: unknown }).__inputLab = { labStore, settingsStore, pipeline };
    try {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      setTheme(saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    } catch {}
  }, []);
  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  };

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const draftRef = useRef(draft);
  const messagesRef = useRef(messages);
  const thinkingRef = useRef(thinking);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);

  const send = useCallback(async () => {
    const text = draftRef.current.trim();
    if (!text || thinkingRef.current) return;
    const history = [...messagesRef.current, newMessage("user", text)];
    setMessages(history);
    setDraft("");
    setThinking(true);
    try {
      const reply = await askAssistant(history);
      setMessages((m) => [...m, newMessage("assistant", reply)]);
    } catch (err) {
      setMessages((m) => [...m, newMessage("assistant", `Request failed: ${String(err)}`)]);
    } finally {
      setThinking(false);
    }
  }, []);

  const newChat = useCallback(() => { setMessages([]); setDraft(""); }, []);

  const act = useCallback(
    (target: FocusTarget | null, action: string, timestamp = performance.now()) => {
      const scroll = (dir: 1 | -1) => transcriptRef.current?.scrollBy({ top: dir * transcriptRef.current.clientHeight * 0.7, behavior: "smooth" });
      switch (action) {
        case "TYPE": setDraft((d) => appendChar(d, target?.payload?.char as string)); break;
        case "SPACE": setDraft((d) => (d.endsWith(" ") || d.length === 0 ? d : d + " ")); break;
        case "BACKSPACE": setDraft((d) => d.slice(0, -1)); break;
        case "PROMPT": setDraft(target?.payload?.text as string); break;
        case "SEND": void send(); break;
        case "NEW_CHAT": newChat(); break;
        case "SCROLL_UP": scroll(-1); break;
        case "SCROLL_DOWN": scroll(1); break;
      }
      if (target) setLastFlash((f) => ({ ...f, [target.id]: timestamp }));
    },
    [send, newChat],
  );
  const handleAction = useCallback((a: ActionEvent) => act(a.target, a.action, a.timestamp), [act]);
  useEffect(() => pipeline.dispatcher.register(handleAction), [handleAction]);
  const onActivate = useCallback((t: FocusTarget) => act(t, t.action), [act]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); void send(); }
      else if (e.key === "Backspace") setDraft((d) => d.slice(0, -1));
      else if (e.key.length === 1) setDraft((d) => d + e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send]);

  const stateLabel = lab.interaction.state.replace("_", " ").toLowerCase();
  const focusLabel = lab.interaction.armedTarget?.label ?? lab.interaction.focusTarget?.label;
  const cameraProblem = lab.camera.status === "denied" || lab.camera.status === "error" || lab.camera.status === "unavailable";

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("chat-root flex h-screen text-[15px]", theme === "dark" && "dark")}>
        <aside className={cn("flex shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200", sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden")}>
          <div className="flex h-14 items-center justify-between px-3">
            <IconButton label="Close sidebar" onClick={() => setSidebarOpen(false)}><PanelLeft className="size-5" /></IconButton>
          </div>
          <nav className="flex flex-col gap-0.5 px-3">
            <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">Interfaces</div>
            <Link href="/" className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm hover:bg-accent"><FlaskConical className="size-[18px]" /> Input Lab</Link>
            <Link href="/chat" className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm hover:bg-accent"><MessageSquare className="size-[18px]" /> ChatGPT No Hands</Link>
            <button onClick={newChat} className="flex h-9 items-center gap-2.5 rounded-lg bg-accent px-2 text-left text-sm"><Keyboard className="size-[18px]" /> Keyboard Chat</button>
          </nav>
          <div className="flex-1" />
          <div className="px-3 pb-3">
            <div className="rounded-2xl border border-sidebar-border bg-background p-2">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" style={{ transform: settings.mirror ? "scaleX(-1)" : "none" }} />
                <LandmarkOverlay />
                {!camOn && <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground"><CameraOff className="size-5" />{lab.camera.status === "requesting" ? "Requesting…" : "Camera off"}</div>}
                {camOn && lab.tracking.status === "loading" && <div className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-center text-[11px] text-muted-foreground">Loading face model…</div>}
                {lab.tracking.status === "error" && <div className="absolute inset-0 overflow-auto bg-background/90 p-2 text-[11px] leading-snug text-destructive">{lab.tracking.message}</div>}
              </div>
              <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", trackingOn ? "bg-foreground" : "bg-muted-foreground/40")} />{trackingOn ? "Tracking" : camOn ? "No face" : "Idle"}</span>
                <span>{settings.calibration ? "Calibrated" : "Not calibrated"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {!camOn ? <Button size="sm" onClick={start} disabled={lab.camera.status === "requesting"} className="rounded-lg gap-1.5"><Camera className="size-3.5" /> Start</Button> : <Button size="sm" variant="secondary" onClick={stop} className="rounded-lg gap-1.5"><CameraOff className="size-3.5" /> Stop</Button>}
                <Button size="sm" variant="outline" onClick={() => { pipeline.startCalibration(); pipeline.recenterGrid(); }} disabled={!trackingOn} className="rounded-lg gap-1.5"><Crosshair className="size-3.5" /> Calibrate</Button>
              </div>
              {cameraProblem && <div className="mt-2 px-1 text-[11px] leading-snug text-destructive">{lab.camera.message}</div>}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <IconButton label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggleTheme}>{theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}</IconButton>
              <IconButton label="Interaction settings" active={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}><Settings2 className="size-5" /></IconButton>
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-14 shrink-0 items-center justify-between px-3">
            <div className="flex items-center gap-1">
              {!sidebarOpen && <IconButton label="Open sidebar" onClick={() => setSidebarOpen(true)}><PanelLeft className="size-5" /></IconButton>}
              <Button variant="ghost" className="h-9 gap-1 rounded-lg px-2.5 text-[18px] font-medium text-foreground hover:bg-accent">
                ChatGPT <span className="font-normal text-muted-foreground">Keyboard Chat</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </Button>
            </div>
            <Badge variant="outline" className="h-7 gap-1.5 rounded-full border-border px-2.5 text-xs font-normal text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", lab.interaction.state === "ARMED" || lab.interaction.state === "CONFIRMING" ? "bg-foreground" : "bg-muted-foreground/50")} />
              {stateLabel}{focusLabel ? ` · ${focusLabel}` : ""}
            </Badge>
          </header>

          <ChatTranscript ref={transcriptRef} messages={messages} thinking={thinking} />

          <div className="shrink-0 px-4 pb-3">
            <div className="mx-auto w-full max-w-[768px]">
              <div className={cn("flex items-end gap-2 rounded-[28px] border border-composer-border bg-composer py-2 pl-5 pr-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow", draft && "shadow-[0_4px_16px_rgba(0,0,0,0.06)]")}>
                {/* grows up to ~5 lines, then scrolls internally pinned to the end, so the keyboard below never moves */}
                <TailText tail={draft} className="max-h-[8.5rem] min-h-10 flex-1 self-center py-2 text-base leading-6" aria-live="polite" aria-label="Current message">
                  {draft ? draft : <span className="text-muted-foreground">Ask anything</span>}
                  <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] animate-pulse bg-foreground" aria-hidden />
                </TailText>
                <Button size="icon-lg" aria-label="Send" onClick={() => void send()} disabled={!draft.trim() || thinking} className="size-9 shrink-0 rounded-full disabled:opacity-20"><ArrowUp className="size-5" strokeWidth={2.5} /></Button>
              </div>
              <div className="mt-3">
                <KeyboardChatControls lastFlash={lastFlash} canSend={draft.trim().length > 0 && !thinking} hasMessages={messages.length > 0 || draft.length > 0} onActivate={onActivate} />
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {camOn && !settings.calibration ? "Not calibrated — press Calibrate in the sidebar for accurate head pointing." : "Look at a key to focus it, hold to arm, then long‑blink or nod to confirm. Camera frames never leave this browser."}
              </p>
            </div>
          </div>
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
