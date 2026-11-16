// The live duel is laid out at the design size (1920 x 1080 CSS px, or more in one direction to fill a
// window of another shape; the field keeps its 16:9 size) and scaled to the window as one piece (CSS `zoom`), so a laptop screen shows
// exactly the full-size layout, only smaller, instead of a re-flowed one. Phones (under 640 x 400) keep the
// responsive layout. While scaled, the desktop CSS applies whatever the window size (see the scaled copies
// in duel-scene.css, generated next to each desktop @media block).
//
// Inside the zoomed page, a CSS px is `k` screen px. Anything placed from screen coordinates
// (getBoundingClientRect, mouse positions) divides by uiZoom(); the animation layer undoes the zoom.
import { useLayoutEffect, useState } from "react";
import { useDuelSettings, type UiSize } from "./duelSettings.ts";

export const DESIGN = { w: 1920, h: 1080 } as const;
/** Below this the phone / tablet layout is used (no scaling). */
const MIN = { w: 640, h: 400 } as const;

let k = 1;
/** The duel page's current zoom (1 when not scaled). */
export const uiZoom = () => k;
/** Screen px -> CSS px inside the scaled page. */
export const toCss = (px: number) => px / k;

/** The layout's design width for an interface size (16:9, so the height is width x 9/16). */
const WIDTH: Record<Exclude<UiSize, "auto">, number> = { compact: 1920, medium: 1680, large: 1480, xl: 1300 };
/** "auto": the full 1920 design, but never shrunk below this (small windows get a narrower design instead). */
const AUTO_MIN_ZOOM = 0.62, AUTO_MIN_WIDTH = 1280;

function zoomFor(w: number, h: number, size: UiSize): number {
  // auto: as wide as keeps the zoom at AUTO_MIN_ZOOM or more (by width and by height), between 1280 and 1920
  const dw = size === "auto"
    ? Math.min(DESIGN.w, Math.max(AUTO_MIN_WIDTH, Math.min(w / AUTO_MIN_ZOOM, (h / AUTO_MIN_ZOOM) * 16 / 9)))
    : WIDTH[size];
  const dh = dw * 9 / 16;
  return Math.min(w / dw, h / dh);
}

/** The zoom for the live duel page while `on` (null = not scaled: phone layout, or not live). */
export function useUiScale(on: boolean): number | null {
  const size = useDuelSettings().uiSize;
  const compute = () => (on && innerWidth >= MIN.w && innerHeight >= MIN.h ? zoomFor(innerWidth, innerHeight, size) : null);
  const [zoom, setZoom] = useState<number | null>(compute);
  useLayoutEffect(() => {
    const apply = () => { const z = compute(); k = z ?? 1; setZoom(z); };
    apply();
    addEventListener("resize", apply);
    return () => { removeEventListener("resize", apply); k = 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, size]);
  return zoom;
}
