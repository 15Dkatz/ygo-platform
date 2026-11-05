import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "./animator.ts";

/** Life Points that count up / down to a new value, with a colour flash and a floating delta. */
export function AnimatedLp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<{ n: number; id: number } | null>(null);
  const from = useRef(value);
  const shownRef = useRef(value);
  shownRef.current = shown;

  useEffect(() => {
    const start = shownRef.current;
    if (start === value) return;
    const d = value - from.current;
    from.current = value;
    setDelta({ n: d, id: Date.now() });
    const clear = setTimeout(() => setDelta(null), 1100);
    if (reducedMotion()) { setShown(value); return () => clearTimeout(clear); }
    const t0 = performance.now(), ms = 450;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); clearTimeout(clear); setShown(value); };
  }, [value]);

  return (
    <span className={`duel-lp-num ${delta ? (delta.n < 0 ? "is-down" : "is-up") : ""}`}>
      {shown}
      {delta && <span key={delta.id} className={`duel-lp-delta ${delta.n < 0 ? "is-down" : "is-up"}`} aria-hidden="true">{delta.n > 0 ? `+${delta.n}` : delta.n}</span>}
    </span>
  );
}
