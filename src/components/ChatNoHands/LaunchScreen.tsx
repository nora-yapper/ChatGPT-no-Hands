"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TUBE_H, TUBE_POINTS, TUBE_R_END, TUBE_R_START, TUBE_STOPS, TUBE_W } from "./launchTube";

/**
 * The launch screen shown every time ISNT opens. The brand tube draws itself on as one continuous stroke, from its
 * thin tail to its round head, while the wordmark bounces in letter by letter and spells itself out
 * (I·S·N·T → Ima Slike Nema Tona → "picture, but no sound"). It leaves once the app is loaded and the intro has played.
 */

/** how long the tube takes to draw on */
const DRAW_MS = 1300;
/** when the last line of text (the gloss) has finished arriving — keep in step with the delays in globals.css */
const INTRO_END_MS = 2250;
/** then everything holds still long enough to read before the screen leaves */
const READ_HOLD_MS = 1500;
const MIN_SHOWN_MS = INTRO_END_MS + READ_HOLD_MS;
const MIN_SHOWN_REDUCED_MS = 700;
const EXIT_MS = 550;

const LETTERS = ["I", "S", "N", "T"];
const WORDS = ["Ima", "Slike", "Nema", "Tona"];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** One gradient disc, drawn once and stamped (scaled) for every circle: in the asset each circle carries the same
 *  horizontal gradient across its own diameter, so a scaled copy is exact. */
function makeSprite(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, size, 0);
  TUBE_STOPS.forEach((col, i) => grad.addColorStop(i / (TUBE_STOPS.length - 1), col));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  return c;
}

function useTubeCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const count = TUBE_POINTS.length / 2;
    const sprite = makeSprite(512);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drawn = 0;
    let scale = 1;
    let raf = 0;

    const stamp = (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        const r = (TUBE_R_START + ((TUBE_R_END - TUBE_R_START) * i) / (count - 1)) * scale;
        ctx.drawImage(sprite, TUBE_POINTS[i * 2] * scale - r, TUBE_POINTS[i * 2 + 1] * scale - r, r * 2, r * 2);
      }
    };

    // the canvas is sized in CSS to the tube's aspect; match its backing store to the pixels it covers
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round((width * dpr * TUBE_H) / TUBE_W);
      scale = canvas.width / TUBE_W;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stamp(0, drawn);
    };
    fit();
    window.addEventListener("resize", fit);

    if (reduced) {
      stamp(0, count);
      drawn = count;
    } else {
      const start = performance.now();
      const tick = (now: number) => {
        const target = Math.round(easeInOut(Math.min(1, (now - start) / DRAW_MS)) * count);
        // circles only ever go on top of the ones before, so each frame stamps just the new ones
        stamp(drawn, target);
        drawn = target;
        if (drawn < count) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, [ref]);
}

export function LaunchScreen({ ready }: { ready: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [gone, setGone] = useState(false);
  const leaving = ready && minElapsed;
  useTubeCanvas(canvasRef);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => setMinElapsed(true), reduced ? MIN_SHOWN_REDUCED_MS : MIN_SHOWN_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setGone(true), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [leaving]);

  if (gone) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Opening ISNT"
      className={cn("isnt-launch fixed inset-0 z-[100] overflow-hidden", leaving && "isnt-launch-leave")}
      style={{ ["--isnt-exit-ms" as string]: `${EXIT_MS}ms` }}
    >
      <div aria-hidden className="isnt-launch-tube">
        <canvas ref={canvasRef} />
      </div>

      <div aria-hidden className="isnt-launch-type">
        <div className="isnt-launch-word font-hand">
          {LETTERS.map((l, i) => (
            <span key={l} className="isnt-letter" style={{ ["--i" as string]: i }}>
              <span className="isnt-letter-in">{l}</span>
            </span>
          ))}
        </div>
        <div className="isnt-launch-expand">
          {WORDS.map((w, i) => (
            <span key={w} className="isnt-expand-mask">
              <span className="isnt-expand-word" style={{ ["--i" as string]: i }}>
                <b>{w[0]}</b>
                {w.slice(1)}
              </span>
            </span>
          ))}
        </div>
        <div className="isnt-launch-gloss">picture, but no sound</div>
      </div>
    </div>
  );
}
