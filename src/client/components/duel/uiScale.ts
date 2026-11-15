// The live duel is laid out at the design size (1920 x 1080 CSS px, or more in one direction to fill a
// window of another shape; the field keeps its 16:9 size) and scaled to the window as one piece (CSS `zoom`), so a laptop screen shows
// exactly the full-size layout, only smaller, instead of a re-flowed one. Phones (under 640 x 400) keep the
// responsive layout. While scaled, the desktop CSS applies whatever the window size (see the scaled copies
// in duel-scene.css, generated next to each desktop @media block).
//
// Inside the zoomed page, a CSS px is `k` screen px. Anything placed from screen coordinates
// (getBoundingClientRect, mouse positions) divides by uiZoom(); the animation layer undoes the zoom.
import { useLayoutEffect, useState } from "react";

export const DESIGN = { w: 1920, h: 1080 } as const;
/** Below this the phone / tablet layout is used (no scaling). */
const MIN = { w: 640, h: 400 } as const;

let k = 1;
/** The duel page's current zoom (1 when not scaled). */
export const uiZoom = () => k;
/** Screen px -> CSS px inside the scaled page. */
export const toCss = (px: number) => px / k;

/** The zoom for the live duel page while `on` (null = not scaled: phone layout, or not live). */
export function useUiScale(on: boolean): number | null {
  const compute = () => (on && innerWidth >= MIN.w && innerHeight >= MIN.h ? Math.min(innerWidth / DESIGN.w, innerHeight / DESIGN.h) : null);
  const [zoom, setZoom] = useState<number | null>(compute);
  useLayoutEffect(() => {
    const apply = () => { const z = compute(); k = z ?? 1; setZoom(z); };
    apply();
    addEventListener("resize", apply);
    return () => { removeEventListener("resize", apply); k = 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  return zoom;
}
