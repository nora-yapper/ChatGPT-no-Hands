/**
 * ISNT is built for laptop and desktop screens: the head-tracked grid, the dwell targets and the webcam framing all
 * assume a big display. "Small" means a touch-only device (no fine pointer anywhere: phones, tablets without a
 * trackpad) or a physical screen whose short side is under 600px. It reads the screen, not the window, so a narrow
 * desktop window still gets the app.
 *
 * Self-contained (globals only) so it can also be stringified into the inline pre-paint script in app/layout.tsx.
 */
export function isSmallScreen(): boolean {
  return !window.matchMedia("(any-pointer: fine)").matches || Math.min(screen.width, screen.height) < 600;
}

/** Runs before first paint: marks <html> so CSS can hide the launch screen on phones instead of flashing it. */
export const smallScreenScript = `try{if((${isSmallScreen.toString()})())document.documentElement.dataset.isntSmall=""}catch(e){}`;
