"use client";

import { useEffect, useRef } from "react";
import { labStore } from "@/store/labStore";
import { settingsStore } from "@/store/settingsStore";
import { LM } from "@/tracking/landmarkIndices";

const IRIS_L = [468, 469, 470, 471, 472];
const IRIS_R = [473, 474, 475, 476, 477];

/** Canvas overlay drawn directly from the high-frequency store on rAF (no React re-renders). */
export function LandmarkOverlay({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = ref.current;
      if (!canvas) return;
      const { frame, focusId, interaction } = labStore.latest;
      const { mirror, showLandmarks } = settingsStore.get();
      const parent = canvas.parentElement;
      if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      if (!frame || !frame.faceDetected) return;

      // Map normalized landmarks onto the rect the sibling <video> actually paints:
      // object-fit: contain letterboxes (scale = min), cover crops (scale = max).
      const video = parent?.querySelector("video");
      const fit = video ? getComputedStyle(video).objectFit : "contain";
      const iw = Math.max(1, frame.imageWidth);
      const ih = Math.max(1, frame.imageHeight);
      const scale = fit === "cover" ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
      const vw = iw * scale, vh = ih * scale;
      const ox = (W - vw) / 2, oy = (H - vh) / 2;
      const px = (x: number) => ox + (mirror ? 1 - x : x) * vw;
      const py = (y: number) => oy + y * vh;

      if (showLandmarks) {
        ctx.fillStyle = "rgba(34, 211, 238, 0.55)";
        for (let i = 0; i < Math.min(468, frame.landmarks.length); i++) {
          const p = frame.landmarks[i];
          ctx.fillRect(px(p.x) - 0.5, py(p.y) - 0.5, 1.5, 1.5);
        }
        ctx.fillStyle = "#f59e0b";
        for (const i of [...IRIS_L, ...IRIS_R]) {
          const p = frame.landmarks[i];
          if (!p) continue;
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        const nose = frame.landmarks[LM.noseTip];
        if (nose) {
          ctx.strokeStyle = "#34d399";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px(nose.x), py(nose.y), 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (frame.bbox) {
        const b = frame.bbox;
        const armed = interaction.state === "ARMED" || interaction.state === "CONFIRMING";
        ctx.strokeStyle = armed ? "#f59e0b" : focusId ? "#22d3ee" : "rgba(215, 222, 230, 0.35)";
        ctx.lineWidth = 1;
        const x0 = mirror ? px(b.x + b.w) : px(b.x);
        ctx.strokeRect(x0, py(b.y), b.w * vw, b.h * vh);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 ${className ?? ""}`} />;
}
