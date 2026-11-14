// The canvas effect around the card whose effect is resolving (see anim/resolveFx.ts): a BACK canvas
// under the card's face and a FRONT one over it, both FX_SCALE times the card's size.
import { useEffect, useRef } from "react";
import { CANVAS_STYLES, parseColor, runResolveFx, type FxStyle } from "./anim/resolveFx.ts";

export const usesCanvas = (style: string) => CANVAS_STYLES.has(style);

export function ResolveFx({ style }: { style: string }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const card = wrap.current?.parentElement;
    if (!card || !back.current || !front.current || !usesCanvas(style)) return;
    // the effect colour is the card's --src-c (theme / chosen colour); re-read now and then
    let col = parseColor(getComputedStyle(card).getPropertyValue("--src-c")), at = 0;
    const color = () => {
      const now = performance.now();
      if (now - at > 500) { at = now; col = parseColor(getComputedStyle(card).getPropertyValue("--src-c"), col); }
      return col;
    };
    // layout size (unaffected by the table's 3D tilt)
    const size = () => ({ w: card.offsetWidth, h: card.offsetHeight });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    return runResolveFx(back.current, front.current, style as FxStyle, color, size, still);
  }, [style]);
  if (!usesCanvas(style)) return null;
  return (
    <span ref={wrap} className="duel-rfx" aria-hidden="true">
      <canvas ref={back} className="duel-rfx-back" />
      <canvas ref={front} className="duel-rfx-front" />
    </span>
  );
}
