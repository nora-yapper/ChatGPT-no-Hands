"use client";

import { useSyncExternalStore } from "react";
import { isSmallScreen } from "@/lib/smallScreen";

const noSubscribe = () => () => {};

/** null until hydrated, then whether this device is too small for ISNT (see lib/smallScreen) */
export function useSmallScreen(): boolean | null {
  return useSyncExternalStore(noSubscribe, isSmallScreen, () => null);
}

/** Shown on phones (e.g. after scanning the QR code) in place of the app, which never mounts there, so the camera is never asked for. */
export function BigScreenNotice() {
  return (
    <main className="isnt-small-screen fixed inset-0 z-[110] flex flex-col items-center justify-center gap-5 px-8 text-center">
      <div aria-hidden className="font-hand text-[96px] leading-[0.8]">ISNT</div>
      <h1 className="max-w-[22rem] text-xl font-semibold tracking-tight">Please open ISNT on a computer</h1>
      <p className="isnt-small-screen-dim max-w-[22rem] text-[15px] leading-relaxed">
        This app has been made specifically for big screens and won&apos;t work on smaller ones. Open this link on a
        laptop or desktop with a webcam to try it.
      </p>
    </main>
  );
}
