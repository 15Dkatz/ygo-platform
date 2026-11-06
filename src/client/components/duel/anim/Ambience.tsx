import { useEffect, useRef } from "react";
import { reducedMotion } from "./animator.ts";

/**
 * Slow drifting motes over the playmat: one small canvas, ~30 fps, paused while the tab is
 * hidden, absent with prefers-reduced-motion. The colour comes from the `--mat-mote` token.
 */
export function Ambience() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reducedMotion() || typeof requestAnimationFrame !== "function") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0, last = 0, color = "rgba(160,170,255,.5)";
    const motes = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, v: 0.004 + Math.random() * 0.01, p: Math.random() * Math.PI * 2 }));
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      color = getComputedStyle(canvas).getPropertyValue("--mat-mote").trim() || color;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || t - last < 33) return;
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      for (const m of motes) {
        m.y -= m.v * dt * 6;
        m.p += dt;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        const x = (m.x + Math.sin(m.p) * 0.01) * w, y = m.y * h;
        ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(m.p * 0.7));
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} className="duel-ambience" aria-hidden="true" />;
}
