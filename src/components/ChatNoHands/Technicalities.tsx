"use client";

import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { useHeadScrollTarget } from "./useHeadScroll";

/*
 * More › Technicalities: how ISNT works, organised by the five stages of a face tracking user interface from
 * Villaroman, Rowe & Helps (2013), then what ISNT adds on top (composing prompts), the open-source tools it
 * is built with and the research it draws on. Read-only. Keep in step with the README's
 * "Research & open source" section.
 */

const STAGES: Array<{ stage: string; paper: string; isnt: string[]; tools: string }> = [
  {
    stage: "User input",
    paper: "The movement that controls the interface.",
    isnt: [
      "Turning and nodding the head moves the pointer.",
      "Face gestures (mouth, brows, long blink) and head gestures (turn, tilt, roll) confirm and run shortcuts.",
      "Looking at a field never clicks it.",
    ],
    tools: "—",
  },
  {
    stage: "Capture technology",
    paper: "The device that records the user.",
    isnt: ["An ordinary webcam in the browser: front camera, 640 × 480, ~30 fps.", "Frames never leave the browser; no video is stored."],
    tools: "Web platform (getUserMedia)",
  },
  {
    stage: "Feature retrieval",
    paper: "Finding the face and its features.",
    isnt: [
      "MediaPipe Face Landmarker, one face, on the GPU.",
      "Per frame: 478 landmarks, 52 expression scores and head yaw, pitch, roll.",
      "During an expression, head pose uses only rigid points, so it doesn't move the pointer.",
    ],
    tools: "MediaPipe Tasks Vision",
  },
  {
    stage: "Feature processing",
    paper: "Turning features into steady signals.",
    isnt: [
      "Calibrated to your neutral pose.",
      "Smoothing (moving average) and a dead zone on head angles.",
      "Detectors with thresholds and hold times make gestures; a state machine decides what they do.",
    ],
    tools: "ISNT's own code",
  },
  {
    stage: "Pointer behaviour",
    paper: "How input moves and selects on screen.",
    isnt: [
      "Grid Glide: the pointer glides with head speed and snaps magnetically to the nearest field.",
      "The same pointer speed in pixels on every screen.",
      "Resting on a field arms it; a confirm gesture acts.",
    ],
    tools: "ISNT's own code, React",
  },
];

const TOOLS: Array<{ name: string; use: string; licence: string }> = [
  { name: "MediaPipe Tasks Vision", use: "face tracking", licence: "Apache-2.0" },
  { name: "Next.js · React · TypeScript", use: "the app itself", licence: "MIT · MIT · Apache-2.0" },
  { name: "Tailwind CSS · tw-animate-css", use: "styling and animation", licence: "MIT" },
  { name: "shadcn/ui · Radix UI", use: "UI components", licence: "MIT" },
  { name: "cva · clsx · tailwind-merge", use: "component styles", licence: "Apache-2.0 · MIT · MIT" },
  { name: "Lucide", use: "icons", licence: "ISC" },
  { name: "Anthropic TypeScript SDK", use: "talking to Claude", licence: "MIT" },
  { name: "Zod", use: "checking Claude's answers", licence: "MIT" },
  { name: "Vitest · ESLint", use: "tests and code checks", licence: "MIT" },
];

export function Technicalities({ active }: { active: boolean }) {
  // on screens where it can't all fit, head scroll (the app's own gesture) scrolls it
  const boxRef = useRef<HTMLDivElement | null>(null);
  useHeadScrollTarget({ scrollBy: (dy) => boxRef.current?.scrollBy({ top: dy, behavior: "instant" }) }, active);
  const heading = "mb-1.5 text-[0.85em] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
  return (
    <div ref={boxRef} className="h-full min-h-0 overflow-auto px-1 leading-snug" style={{ fontSize: "clamp(10px, 1.35vh, 12px)" }}>
      <p className="mb-2 text-muted-foreground">
        How ISNT works, following the five stages of a face tracking interface described by Villaroman, Rowe &amp; Helps (2013): webcam → MediaPipe → smoothing and dead zone → magnetic grid.
      </p>

      {/* the five stages, left to right as the signal flows */}
      <div className="mb-2.5 grid grid-cols-5 gap-1.5">
        {STAGES.map((s, i) => (
          <div key={s.stage} className="relative flex flex-col rounded-xl border border-border bg-muted/40 px-2.5 py-2">
            <div className="font-semibold"><span className="font-medium text-muted-foreground">{i + 1} · </span>{s.stage}</div>
            <div className="mb-1 italic text-muted-foreground">{s.paper}</div>
            <ul className="mb-1 flex-1 list-disc space-y-0.5 pl-3.5">
              {s.isnt.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <div className="border-t border-border pt-1 text-[0.9em] text-muted-foreground">{s.tools}</div>
            {i < STAGES.length - 1 && <ArrowRight className="absolute -right-[0.7rem] top-1/2 z-[1] size-3.5 -translate-y-1/2 rounded-full bg-background text-muted-foreground" aria-hidden />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-3">
          <section>
            <h3 className={heading}>Beyond the paper: writing without typing</h3>
            <ul className="list-disc space-y-0.5 pl-3.5">
              <li>Prompts are built by choosing, not typing: choose → see predictions → choose again. The keyboard is always there as an escape hatch.</li>
              <li>Starter words: question words plus common prompt verbs (Summarize, Compare, Explain…) from the UMN CCAPS list.</li>
              <li>Claude (Sonnet 5) predicts 4 words and 4 phrases from the whole prompt; each streams in and is checked for grammar, repeats and variety.</li>
              <li>Offline mode: local rules in the browser, nothing sent anywhere.</li>
            </ul>
          </section>
          <section>
            <h3 className={heading}>Research</h3>
            <ul className="space-y-1.5">
              <li>
                Villaroman, N., Rowe, D., &amp; Helps, R. (2013). Design and evaluation of face tracking user interfaces for accessibility. <i>Proceedings of the 2nd Annual Conference on Research in Information Technology (RIIT &rsquo;13)</i>, 65–70. ACM.{" "}
                <a className="underline underline-offset-2" href="https://doi.org/10.1145/2512209.2512218" target="_blank" rel="noreferrer">doi:10.1145/2512209.2512218</a>
                <div className="text-muted-foreground">Webcam face tracking as cheap, non-intrusive input for people who can&rsquo;t use a mouse and keyboard; the five stages above.</div>
              </li>
              <li>
                University of Minnesota CCAPS. <i>Common Writing Prompt Terms</i>.{" "}
                <a className="underline underline-offset-2" href="https://ccaps.umn.edu/esl-resources/students/writing/common-prompts" target="_blank" rel="noreferrer">ccaps.umn.edu</a>
                <div className="text-muted-foreground">The prompt verbs behind the starter words and predictions.</div>
              </li>
            </ul>
          </section>
        </div>
        <section>
          <h3 className={heading}>Open-source tools</h3>
          <table className="w-full border-collapse text-left">
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.name} className="border-t border-border align-top first:border-t-0">
                  <td className="py-1 pr-2 font-medium">{t.name}</td>
                  <td className="py-1 pr-2 text-muted-foreground">{t.use}</td>
                  <td className="whitespace-nowrap py-1 text-right text-muted-foreground">{t.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
