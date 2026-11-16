// Summon effects: one signature per kind of summon.
import type { Sfx } from "../sfx.ts";
import { TONE, bit, box, burst, circleSvg, column, ctr, land, quake, rise, sfx, shock, sq, sweep } from "./core.ts";
import type { R, Run, SummonKind } from "./core.ts";

// ---------------------------------------------------------------------------------------
// summons

export interface SummonOpts {
  /** the real card element (to animate it landing / rising) */
  card?: HTMLElement | null;
  /** what shakes (the board) */
  stage?: Element | null;
  big?: boolean;
  /** Link Monster arrows ("Top", "Bottom-Left", ...) */
  markers?: string[] | null;
}

/** Play the summon signature of `kind` on the zone at `r`. Returns how long it runs (ms). */
export function summon(layer: HTMLElement, run: Run, r: R, kind: SummonKind, delay: number, o: SummonOpts = {}): number {
  const tone = TONE[kind];
  const heavy = !!o.big;
  let ms = 700;
  // its sound, timed to the moment that matters in its look (the landing, the rise...)
  const at: Record<SummonKind, number> = { normal: 230, flip: 0, tribute: 380, set: 200, special: 300, ritual: 0, fusion: 0, synchro: 0, xyz: 0, link: 0, pendulum: 0 };
  sfx(`sum-${kind}` as Sfx, { inMs: delay + at[kind] });
  switch (kind) {
    case "normal": case "flip":
      if (kind === "normal") land(o.card ?? null, run, delay, heavy);
      shock(layer, run, r, "rgb(230 220 200 / .7)", delay + 230, heavy ? 2.4 : 1.8, 600, true, heavy ? 5 : 3);
      dust(layer, run, r, delay + 230, heavy ? 16 : 10);
      sweep(layer, run, r, tone, delay + 260);
      quake(o.stage ?? null, run, delay + 230, heavy ? 6 : 2.5);
      ms = 820; break;
    case "tribute":
      land(o.card ?? null, run, delay + 120, true);
      shock(layer, run, r, tone, delay + 380, 2.6, 700, true, 5);
      shock(layer, run, r, "rgb(255 240 220 / .8)", delay + 440, 1.9, 600, true, 2);
      dust(layer, run, r, delay + 380, 18);
      burst(layer, run, r, tone, delay + 380, 18, 1.4);
      quake(o.stage ?? null, run, delay + 380, 7);
      ms = 1000; break;
    case "set": {
      const el = bit(layer, "sfx-setveil", { ...box(r, 2), "--c": tone }, 700, delay + 200);
      run(el, [{ opacity: 0, backgroundPosition: "-120% 0" }, { offset: 0.3, opacity: 1 }, { opacity: 0, backgroundPosition: "220% 0" }], { duration: 700, delay: delay + 200, easing: "ease-in-out", fill: "both" });
      shock(layer, run, r, "rgb(120 150 230 / .45)", delay + 220, 1.4, 500, true, 2);
      ms = 800; break;
    }
    case "special": case "ritual": {
      const el = bit(layer, `sfx-circle ${kind === "ritual" ? "is-ritual" : ""}`, { ...sq(r, 1.7), "--c": tone }, 1100, delay, circleSvg(kind === "ritual" ? 5 : 6));
      run(el, [{ transform: "scaleY(.45) rotate(-60deg) scale(.2)", opacity: 0 }, { offset: 0.3, transform: "scaleY(.45) rotate(0deg) scale(1)", opacity: 1 },
        { offset: 0.75, transform: "scaleY(.45) rotate(50deg) scale(1.05)", opacity: 1 }, { transform: "scaleY(.45) rotate(80deg) scale(1.3)", opacity: 0 }], { duration: 1100, delay, easing: "ease-out", fill: "both" });
      column(layer, run, r, tone, delay + 300, 800, heavy ? 3.4 : 2.6);
      rise(o.card ?? null, run, delay + 380);
      burst(layer, run, r, tone, delay + 520, 16, 1.2);
      if (kind === "ritual") flames(layer, run, r, tone, delay + 120);
      ms = 1150; break;
    }
    case "fusion": {
      const el = bit(layer, "sfx-vortex", { ...sq(r, 1.9), "--c": tone }, 1000, delay);
      run(el, [{ transform: "rotate(0) scale(.2)", opacity: 0 }, { offset: 0.25, opacity: 1 }, { offset: 0.65, transform: "rotate(-540deg) scale(1)", opacity: 1 },
        { offset: 0.75, transform: "rotate(-620deg) scale(.15)", opacity: 1 }, { transform: "rotate(-680deg) scale(2.2)", opacity: 0 }], { duration: 1000, delay, easing: "cubic-bezier(.4,0,.6,1)", fill: "both" });
      flash(layer, run, r, tone, delay + 740, 2.2);
      burst(layer, run, r, tone, delay + 760, 22, 1.6, 800);
      burst(layer, run, r, "#ff9a3c", delay + 780, 10, 1.2, 700);
      rise(o.card ?? null, run, delay + 740, 520);
      ms = 1300; break;
    }
    case "synchro": {
      const c = ctr(r);
      for (let i = 0; i < 3; i++) {
        const s = Math.max(r.width, r.height) * (1.3 - i * 0.15);
        const ring = bit(layer, "sfx-synring", { left: `${c.x - s / 2}px`, top: `${c.y - s / 2}px`, width: `${s}px`, height: `${s}px` }, 900, delay + i * 110);
        run(ring, [{ transform: `translateY(${r.height * 0.7}px) scaleY(.32) scale(.4)`, opacity: 0 }, { offset: 0.3, opacity: 1 },
          { transform: `translateY(${-r.height * (0.9 + i * 0.25)}px) scaleY(.32) scale(1)`, opacity: 0 }], { duration: 900, delay: delay + i * 110, easing: "cubic-bezier(.3,.6,.3,1)", fill: "both" });
      }
      const beamW = r.width * 0.35, beamH = r.height * 4;
      const beam = bit(layer, "sfx-beam", { left: `${c.x - beamW / 2}px`, top: `${c.y - beamH / 2}px`, width: `${beamW}px`, height: `${beamH}px` }, 700, delay + 420);
      run(beam, [{ transform: "scaleX(0) scaleY(.2)", opacity: 0 }, { offset: 0.25, transform: "scaleX(1) scaleY(1)", opacity: 1 }, { transform: "scaleX(.05) scaleY(1)", opacity: 0 }], { duration: 700, delay: delay + 420, easing: "ease-out", fill: "both" });
      stars(layer, run, r, delay + 300);
      rise(o.card ?? null, run, delay + 520, 520);
      flash(layer, run, r, "#ffffff", delay + 520, 1.6);
      ms = 1250; break;
    }
    case "xyz": {
      const g = bit(layer, "sfx-galaxy", { ...sq(r, 2.1) }, 1300, delay);
      run(g, [{ transform: "scaleY(.5) rotate(0) scale(.3)", opacity: 0 }, { offset: 0.25, opacity: 1 }, { offset: 0.7, transform: "scaleY(.5) rotate(300deg) scale(1)", opacity: 1 },
        { transform: "scaleY(.5) rotate(420deg) scale(.1)", opacity: 0 }], { duration: 1300, delay, easing: "cubic-bezier(.4,0,.5,1)", fill: "both" });
      orbit(layer, run, r, tone, delay + 150, 3, 1300);
      flash(layer, run, r, tone, delay + 900, 2);
      rise(o.card ?? null, run, delay + 900, 500);
      burst(layer, run, r, "#fff3c4", delay + 920, 14, 1.3);
      ms = 1450; break;
    }
    case "link": {
      const markers = o.markers?.length ? o.markers : ["Top", "Bottom-Left", "Bottom-Right"];
      const c = ctr(r);
      markers.forEach((m, i) => {
        const [dx, dy] = MARK[m] ?? [0, -1];
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        const dist = Math.max(r.width, r.height) * 0.62;
        const s = Math.max(r.width, r.height) * 0.3;
        const a = bit(layer, "sfx-linkarrow", { left: `${c.x - s / 2 + dx * dist * (dx && dy ? 0.8 : 1)}px`, top: `${c.y - s / 2 + dy * dist * (dx && dy ? 0.8 : 1)}px`, width: `${s}px`, height: `${s}px`, transform: `rotate(${ang}deg)` },
          900, delay + i * 90, `<svg viewBox="0 0 10 10"><path d="M2 1 L8 5 L2 9 L4 5 Z"/></svg>`);
        run(a, [{ opacity: 0, transform: `rotate(${ang}deg) translateX(-14px) scale(.5)` }, { offset: 0.3, opacity: 1, transform: `rotate(${ang}deg) translateX(0) scale(1.15)` },
          { offset: 0.7, opacity: 1, transform: `rotate(${ang}deg) scale(1)` }, { opacity: 0, transform: `rotate(${ang}deg) translateX(6px) scale(.9)` }], { duration: 900, delay: delay + i * 90, easing: "ease-out", fill: "both" });
      });
      const grid = bit(layer, "sfx-circuit", { ...sq(r, 2.2) }, 900, delay + 100);
      run(grid, [{ opacity: 0, transform: "scaleY(.5) scale(.6)" }, { offset: 0.35, opacity: 1 }, { opacity: 0, transform: "scaleY(.5) scale(1.25)" }], { duration: 900, delay: delay + 100, easing: "ease-out", fill: "both" });
      flash(layer, run, r, tone, delay + 520, 1.5);
      rise(o.card ?? null, run, delay + 500, 420);
      ms = 1150; break;
    }
    case "pendulum": {
      const c = ctr(r), w = Math.max(r.width * 4, 240), h = w * 0.55;
      const arc = bit(layer, "sfx-pendarc", { left: `${c.x - w / 2}px`, top: `${r.top - h * 0.55}px`, width: `${w}px`, height: `${h}px` }, 1100, delay,
        `<svg viewBox="0 0 200 110" preserveAspectRatio="none"><path d="M10 10 Q100 130 190 10"/></svg>`);
      run(arc, [{ opacity: 0, transform: "rotate(-14deg)" }, { offset: 0.25, opacity: 1, transform: "rotate(10deg)" }, { offset: 0.55, transform: "rotate(-6deg)" },
        { offset: 0.8, opacity: 1, transform: "rotate(3deg)" }, { opacity: 0, transform: "rotate(0)" }], { duration: 1100, delay, easing: "ease-in-out", fill: "both" });
      column(layer, run, r, tone, delay + 380, 700, 3);
      land(o.card ?? null, run, delay + 420, heavy);
      burst(layer, run, r, tone, delay + 600, 12, 1.1);
      ms = 1150; break;
    }
  }
  if (heavy) {
    sfx("boss", { inMs: delay + ms * 0.55 });
    const dim = bit(layer, "sfx-dim", {}, 1100, delay);
    run(dim, [{ opacity: 0 }, { offset: 0.2, opacity: 1 }, { offset: 0.7, opacity: 1 }, { opacity: 0 }], { duration: 1100, delay, fill: "both" });
    shock(layer, run, r, tone, delay + ms * 0.55, 3.4, 800, false, 4);
  }
  return ms;
}

const MARK: Record<string, [number, number]> = {
  Top: [0, -1], Bottom: [0, 1], Left: [-1, 0], Right: [1, 0],
  "Top-Left": [-1, -1], "Top-Right": [1, -1], "Bottom-Left": [-1, 1], "Bottom-Right": [1, 1],
};

function dust(layer: HTMLElement, run: Run, r: R, delay: number, n: number) {
  const c = ctr(r), bottom = r.top + r.height * 0.85;
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? 1 : -1, s = 6 + Math.random() * 10, dx = dir * (r.width * (0.5 + Math.random() * 0.9)), dy = -Math.random() * r.height * 0.35;
    const p = bit(layer, "sfx-dust", { left: `${c.x - s / 2 + (Math.random() - 0.5) * r.width * 0.6}px`, top: `${bottom - s / 2}px`, width: `${s}px`, height: `${s}px` }, 750, delay);
    run(p, [{ transform: "translate(0,0) scale(.4)", opacity: 0.9 }, { transform: `translate(${dx}px, ${dy}px) scale(1.8)`, opacity: 0 }], { duration: 600 + Math.random() * 200, delay, easing: "cubic-bezier(.1,.7,.3,1)", fill: "both" });
  }
}
function flash(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, k = 1.8) {
  const el = bit(layer, "sfx-flash", { ...sq(r, 1), "--c": tone }, 500, delay);
  run(el, [{ transform: "scale(.3)", opacity: 0 }, { offset: 0.25, transform: `scale(${k * 0.7})`, opacity: 1 }, { transform: `scale(${k})`, opacity: 0 }], { duration: 500, delay, easing: "ease-out", fill: "both" });
}
function stars(layer: HTMLElement, run: Run, r: R, delay: number) {
  const c = ctr(r);
  for (let i = 0; i < 9; i++) {
    const s = 6 + Math.random() * 6, x = c.x + (Math.random() - 0.5) * r.width * 1.6, y = c.y + r.height * (0.2 + Math.random() * 0.6);
    const p = bit(layer, "sfx-star", { left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px` }, 900, delay + i * 30);
    run(p, [{ transform: "translateY(0) scale(.3) rotate(0)", opacity: 0 }, { offset: 0.3, opacity: 1 }, { transform: `translateY(${-r.height * (1 + Math.random())}px) scale(1) rotate(180deg)`, opacity: 0 }],
      { duration: 800, delay: delay + i * 30, easing: "ease-out", fill: "both" });
  }
}
function orbit(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, n: number, ms: number) {
  const c = ctr(r), rad = Math.max(r.width, r.height) * 0.75;
  for (let i = 0; i < n; i++) {
    const s = 10;
    const holder = bit(layer, "sfx-orbit", { left: `${c.x}px`, top: `${c.y}px`, width: "0px", height: "0px" }, ms, delay);
    const dot = document.createElement("i");
    dot.style.cssText = `left:${rad - s / 2}px;top:${-s / 2}px;width:${s}px;height:${s}px;--c:${tone}`;
    holder.appendChild(dot);
    const a0 = (i / n) * 360;
    run(holder, [{ transform: `scaleY(.45) rotate(${a0}deg)`, opacity: 0 }, { offset: 0.15, opacity: 1 }, { offset: 0.7, transform: `scaleY(.45) rotate(${a0 + 540}deg)`, opacity: 1 },
      { transform: `scaleY(.45) rotate(${a0 + 720}deg) scale(.05)`, opacity: 0 }], { duration: ms, delay, easing: "cubic-bezier(.4,0,.6,1)", fill: "both" });
  }
}
function flames(layer: HTMLElement, run: Run, r: R, tone: string, delay: number) {
  const c = ctr(r), rad = Math.max(r.width, r.height) * 0.78;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2, x = c.x + Math.cos(a) * rad, y = c.y + Math.sin(a) * rad * 0.45;
    const f = bit(layer, "sfx-candle", { left: `${x - 6}px`, top: `${y - 18}px`, width: "12px", height: "22px", "--c": tone }, 1000, delay + i * 60);
    run(f, [{ transform: "scale(0)", opacity: 0 }, { offset: 0.25, transform: "scale(1)", opacity: 1 }, { offset: 0.8, opacity: 1 }, { transform: "scale(.6) translateY(-6px)", opacity: 0 }], { duration: 1000, delay: delay + i * 60, fill: "both" });
  }
}
