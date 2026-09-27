"use client";

import type { ReactNode } from "react";

export function Panel({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col rounded border border-lab-border bg-lab-panel ${className}`}>
      <header className="flex shrink-0 items-center justify-between border-b border-lab-border px-3 py-1.5">
        <h2 className="font-mono text-[11px] font-semibold tracking-[0.18em] text-lab-dim">{title}</h2>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}

export function Dot({ on, color = "ok", label }: { on: boolean; color?: "ok" | "warn" | "bad" | "accent"; label?: string }) {
  const c = on ? { ok: "bg-lab-ok", warn: "bg-lab-warn", bad: "bg-lab-bad", accent: "bg-lab-accent" }[color] : "bg-lab-border";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-lab-dim">
      {label}
      <span className={`inline-block h-2 w-2 rounded-full ${c}`} />
    </span>
  );
}

export function Btn({ children, onClick, active, disabled, title, variant = "default", className = "" }: { children: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; title?: string; variant?: "default" | "primary" | "danger"; className?: string }) {
  const base = "rounded border px-2 py-1 font-mono text-[11px] tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const v =
    variant === "primary"
      ? "border-lab-accent/60 bg-lab-accent/15 text-lab-accent hover:bg-lab-accent/25"
      : variant === "danger"
        ? "border-lab-bad/60 bg-lab-bad/10 text-lab-bad hover:bg-lab-bad/20"
        : active
          ? "border-lab-accent/60 bg-lab-accent/15 text-lab-accent"
          : "border-lab-border bg-lab-panel-2 text-lab-fg hover:border-lab-dim";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 mt-3 font-mono text-[10px] font-semibold tracking-[0.18em] text-lab-dim first:mt-0">{children}</div>;
}

export const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
export const fmtSigned = (v: number, d = 2) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(d) : "—");
export const fmtMs = (v: number) => `${Math.round(v)} ms`;

/** Horizontal bar. bipolar: -1..1 centred; else 0..1. */
export function Bar({ value, bipolar, color = "accent", threshold, height = 6 }: { value: number; bipolar?: boolean; color?: "accent" | "armed" | "ok" | "bad" | "confirm"; threshold?: number; height?: number }) {
  const c = { accent: "bg-lab-accent", armed: "bg-lab-armed", ok: "bg-lab-ok", bad: "bg-lab-bad", confirm: "bg-lab-confirm" }[color];
  const v = Math.max(bipolar ? -1 : 0, Math.min(1, value));
  return (
    <div className="relative w-full overflow-hidden rounded-sm bg-lab-border/60" style={{ height }}>
      {bipolar ? (
        <>
          <div className="absolute left-1/2 top-0 h-full w-px bg-lab-dim/60" />
          <div className={`absolute top-0 h-full ${c}`} style={{ left: v < 0 ? `${50 + v * 50}%` : "50%", width: `${Math.abs(v) * 50}%` }} />
        </>
      ) : (
        <div className={`absolute left-0 top-0 h-full ${c}`} style={{ width: `${v * 100}%` }} />
      )}
      {threshold !== undefined && (
        <div className="absolute top-0 h-full w-px bg-lab-warn" style={{ left: bipolar ? `${50 + threshold * 50}%` : `${threshold * 100}%` }} title={`threshold ${threshold}`} />
      )}
    </div>
  );
}

export function SignalRow({ label, value, bipolar, digits = 2, threshold, color, left, right }: { label: string; value: number; bipolar?: boolean; digits?: number; threshold?: number; color?: "accent" | "armed" | "ok" | "bad" | "confirm"; left?: string; right?: string }) {
  return (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-lab-fg/90">{label}</span>
        <span className="font-mono tabular-nums text-lab-fg">{bipolar ? fmtSigned(value, digits) : fmt(value, digits)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {left && <span className="w-9 font-mono text-[9px] text-lab-dim">{left}</span>}
        <Bar value={value} bipolar={bipolar} threshold={threshold} color={color} />
        {right && <span className="w-9 text-right font-mono text-[9px] text-lab-dim">{right}</span>}
      </div>
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2" title="heuristic confidence — not a calibrated probability">
      <div className="w-20">
        <Bar value={value} color={value > 0.7 ? "ok" : value > 0.4 ? "armed" : "bad"} height={5} />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-lab-dim">{pct}% <span className="opacity-60">heur.</span></span>
    </div>
  );
}
