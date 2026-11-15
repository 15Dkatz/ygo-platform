// Summon and activation effects: a signature per kind of summon (drop + dust for a Normal Summon, a
// summoning circle for a Special Summon, a vortex for Fusion, rings + beam for Synchro, a galaxy for Xyz,
// arrows for Link, a swinging arc for Pendulum...), per kind of activation (spell runes, trap snap,
// monster aura), the line a chain draws between its links, and the card-art splash across the board.
//
// Plain DOM + Web Animations in the animation layer (pointer-events: none), like fx.ts. Every element
// removes itself. Used by the duel's animator and by the /dev/summons lab.
import { cardImage } from "../../../api.ts";
import type { Card } from "../../../../shared/types.ts";
import type { SplashStyle } from "../duelSettings.ts";
import "./summon-fx.css";

type Run = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => Animation;
type R = { left: number; top: number; width: number; height: number };

export type SummonKind = "normal" | "tribute" | "set" | "flip" | "special" | "ritual" | "fusion" | "synchro" | "xyz" | "link" | "pendulum";
export type ActivateKind = "spell" | "quick" | "trap" | "counter" | "monster";

export const SUMMON_LABEL: Record<SummonKind, string> = {
  normal: "Normal Summon", tribute: "Tribute Summon", set: "Set", flip: "Flip Summon", special: "Special Summon", ritual: "Ritual Summon",
  fusion: "Fusion Summon", synchro: "Synchro Summon", xyz: "Xyz Summon", link: "Link Summon", pendulum: "Pendulum Summon",
};
export const ACTIVATE_LABEL: Record<ActivateKind, string> = { spell: "Spell Card", quick: "Quick-Play Spell", trap: "Trap Card", counter: "Counter Trap", monster: "Monster Effect" };

/** The colour of each summon / activation, used by its effect and its splash. */
const TONE: Record<SummonKind | ActivateKind, string> = {
  normal: "#f2c14e", tribute: "#ff9f43", set: "#6f8fd8", flip: "#f2c14e", special: "#8fd0ff", ritual: "#5b8cff",
  fusion: "#b46bff", synchro: "#e9f6ff", xyz: "#e6c35c", link: "#3fa9ff", pendulum: "#3fe0b0",
  spell: "#20c997", quick: "#20c997", trap: "#e0457b", counter: "#ff5c8a", monster: "#ffb347",
};
const ATTR_TONE: Record<string, string> = { DARK: "#a35cff", LIGHT: "#ffe58a", FIRE: "#ff6a2a", WATER: "#3fa9ff", EARTH: "#c7964a", WIND: "#5fe39a", DIVINE: "#ffd700" };
export const toneOf = (k: SummonKind | ActivateKind, card?: Card | null) => (k === "monster" && card?.attribute && ATTR_TONE[card.attribute]) || TONE[k];

/** Which summon a monster's summon looks like, from how it came and what it is. */
export function summonKindOf(card: Card | null, how: "normal" | "tribute" | "set" | "flip" | "special", from?: string, pendulumBatch = false): SummonKind {
  if (how !== "special") return how;
  const t = card?.type ?? "";
  if (/Link/i.test(t)) return "link";
  if (/XYZ/i.test(t)) return "xyz";
  if (/Synchro/i.test(t)) return "synchro";
  if (/Fusion/i.test(t) && from === "extra") return "fusion";
  if (/Ritual/i.test(t) && from === "hand") return "ritual";
  if (/Pendulum/i.test(t) && pendulumBatch && (from === "hand" || from === "extra")) return "pendulum";
  return "special";
}
export function activateKindOf(card: Card | null): ActivateKind {
  if (card?.category === "Trap") return card.race === "Counter" ? "counter" : "trap";
  if (card?.category === "Spell") return card.race === "Quick-Play" ? "quick" : "spell";
  return "monster";
}
/** Worth the full treatment: a boss monster. */
export const isBig = (card: Card | null) => !!card && card.category === "Monster" && ((card.level ?? 0) >= 7 || (card.atk ?? 0) >= 2500 || (card.linkval ?? 0) >= 3);

// ---------------------------------------------------------------------------------------
// helpers

function bit(layer: HTMLElement, cls: string, style: Partial<CSSStyleDeclaration> & Record<string, string>, ms: number, delay: number, html = ""): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `sfx ${cls}`;
  for (const [k, v] of Object.entries(style)) {
    if (k.startsWith("--")) el.style.setProperty(k, v as string);
    else (el.style as unknown as Record<string, string>)[k] = v as string;
  }
  if (html) el.innerHTML = html;
  layer.appendChild(el);
  setTimeout(() => el.remove(), ms + delay + 300);
  return el;
}
const ctr = (r: R) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
/** A square box centred on the card, `k` times its larger side. */
const sq = (r: R, k: number) => { const s = Math.max(r.width, r.height) * k, c = ctr(r); return { left: `${c.x - s / 2}px`, top: `${c.y - s / 2}px`, width: `${s}px`, height: `${s}px` }; };
const box = (r: R, pad = 0) => ({ left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });

/** Particles flying out from the card's centre. */
function burst(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, n = 14, reach = 1.1, ms = 700) {
  const c = ctr(r), base = Math.max(r.width, r.height) * reach;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = base * (0.6 + Math.random() * 0.6), s = 3 + Math.random() * 4;
    const p = bit(layer, "sfx-spark", { left: `${c.x - s / 2}px`, top: `${c.y - s / 2}px`, width: `${s}px`, height: `${s}px`, "--c": tone }, ms, delay);
    run(p, [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.3)`, opacity: 0 }],
      { duration: ms * (0.7 + Math.random() * 0.4), delay, easing: "cubic-bezier(.15,.7,.3,1)", fill: "both" });
  }
}
/** Ring(s) expanding from the card. `flat` squashes them onto the table. */
function shock(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, k = 1.6, ms = 650, flat = false, width = 3) {
  const el = bit(layer, "sfx-shock", { ...sq(r, 0.9), "--c": tone, "--w": `${width}px` }, ms, delay);
  const f = flat ? "scaleY(.42)" : "";
  run(el, [{ transform: `${f} scale(.3)`, opacity: 0 }, { offset: 0.15, opacity: 1 }, { transform: `${f} scale(${k})`, opacity: 0 }], { duration: ms, delay, easing: "cubic-bezier(.2,.8,.3,1)", fill: "both" });
}
/** Light sweeping up the card. */
function sweep(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, ms = 520) {
  const el = bit(layer, "sfx-sweep", { ...box(r), "--c": tone }, ms, delay);
  run(el, [{ backgroundPosition: "0 140%", opacity: 0 }, { offset: 0.2, opacity: 1 }, { backgroundPosition: "0 -40%", opacity: 0 }], { duration: ms, delay, easing: "ease-in-out", fill: "both" });
}
/** The whole board / stage shakes a little. */
function quake(target: Element | null, run: Run, delay: number, power = 4) {
  if (!target) return;
  run(target, [{ transform: "none" }, { offset: 0.15, transform: `translate(${-power}px, ${power / 2}px)` }, { offset: 0.35, transform: `translate(${power}px, ${-power / 2}px)` },
    { offset: 0.6, transform: `translate(${-power / 2}px, 0)` }, { offset: 0.8, transform: `translate(${power / 3}px, ${power / 4}px)` }, { transform: "none" }], { duration: 340, delay, easing: "ease-out" });
}
/** A soft column of light rising from the card. */
function column(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, ms = 800, hk = 2.6) {
  const c = ctr(r), w = r.width * 0.9, h = r.height * hk;
  const el = bit(layer, "sfx-column", { left: `${c.x - w / 2}px`, top: `${c.y - h + r.height * 0.3}px`, width: `${w}px`, height: `${h}px`, "--c": tone }, ms, delay);
  run(el, [{ transform: "scaleX(.2) scaleY(.1)", opacity: 0 }, { offset: 0.3, transform: "scaleX(1) scaleY(1)", opacity: 1 }, { transform: "scaleX(.1) scaleY(1.1)", opacity: 0 }], { duration: ms, delay, easing: "ease-out", fill: "both" });
}
/** The real card: dropping in from above and landing. */
function land(card: HTMLElement | null, run: Run, delay: number, heavy: boolean) {
  if (!card) return;
  run(card, [
    { transform: `translateY(${heavy ? -46 : -30}px) scale(${heavy ? 1.3 : 1.18})`, filter: "brightness(1.8)", zIndex: 30 },
    { offset: 0.55, transform: "translateY(0) scale(1)", filter: "brightness(1.3)", zIndex: 30 },
    { offset: 0.7, transform: "scale(1.04, .94)", zIndex: 30 },
    { transform: "none", filter: "none", zIndex: 30 },
  ], { duration: heavy ? 520 : 420, delay, easing: "cubic-bezier(.5,0,.4,1)" });
}
/** The real card: rising out of light. */
function rise(card: HTMLElement | null, run: Run, delay: number, ms = 600) {
  if (!card) return;
  run(card, [
    { transform: "scale(.6)", filter: "brightness(3) saturate(0)", opacity: 0, zIndex: 30 },
    { offset: 0.5, transform: "scale(1.12)", filter: "brightness(1.8)", opacity: 1, zIndex: 30 },
    { transform: "none", filter: "none", opacity: 1, zIndex: 30 },
  ], { duration: ms, delay, easing: "cubic-bezier(.2,.8,.3,1.2)" });
}

const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
function runeRing(n: number, r: number): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360;
    s += `<text x="50" y="${50 - r}" transform="rotate(${a} 50 50)" text-anchor="middle" dominant-baseline="middle">${RUNES[(i * 7) % RUNES.length]}</text>`;
  }
  return s;
}
/** A magic circle: two rings, runes, a star. */
function circleSvg(points = 6): string {
  const star: string[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2, b = ((i + 2) / points) * Math.PI * 2 - Math.PI / 2;
    star.push(`M${50 + 34 * Math.cos(a)} ${50 + 34 * Math.sin(a)}L${50 + 34 * Math.cos(b)} ${50 + 34 * Math.sin(b)}`);
  }
  return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" class="o"/><circle cx="50" cy="50" r="41" class="i"/><g class="runes">${runeRing(18, 44)}</g>
<path d="${star.join("")}" class="s"/><circle cx="50" cy="50" r="12" class="i"/></svg>`;
}

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

// ---------------------------------------------------------------------------------------
// activations

/** An activation's look on the card: spell runes, trap snap, monster aura. Returns its length (ms). */
export function activate(layer: HTMLElement, run: Run, r: R, kind: ActivateKind, delay: number, o: { card?: HTMLElement | null; tone?: string } = {}): number {
  const tone = o.tone ?? TONE[kind];
  const card = o.card ?? null;
  switch (kind) {
    case "spell": case "quick": {
      const fast = kind === "quick";
      const el = bit(layer, "sfx-runes", { ...sq(r, 1.55), "--c": tone }, fast ? 650 : 950, delay, circleSvg(8));
      run(el, [{ transform: "rotate(-40deg) scale(.3)", opacity: 0 }, { offset: 0.3, transform: "rotate(0) scale(1)", opacity: 1 }, { transform: "rotate(70deg) scale(1.35)", opacity: 0 }], { duration: fast ? 650 : 950, delay, easing: "ease-out", fill: "both" });
      if (card) run(card, [{ transform: "none", filter: "none", zIndex: 30 }, { offset: 0.35, transform: "translateY(-8px) scale(1.08)", filter: "brightness(1.5)", zIndex: 30 }, { transform: "none", filter: "none", zIndex: 30 }], { duration: fast ? 420 : 620, delay, easing: "ease-out" });
      if (fast) speedLines(layer, run, r, tone, delay);
      burst(layer, run, r, tone, delay + 150, 10, 1);
      return fast ? 700 : 950;
    }
    case "trap": case "counter": {
      const veil = bit(layer, "sfx-trapflash", { ...box(r, 3), "--c": tone }, 520, delay);
      run(veil, [{ opacity: 0 }, { offset: 0.15, opacity: 1 }, { offset: 0.3, opacity: 0.2 }, { offset: 0.45, opacity: 0.9 }, { opacity: 0 }], { duration: 520, delay, fill: "both" });
      spikes(layer, run, r, tone, delay + 60, kind === "counter" ? 8 : 12);
      if (kind === "counter") {
        const hex = bit(layer, "sfx-hex", { ...sq(r, 1.5), "--c": tone }, 650, delay + 80, `<svg viewBox="0 0 100 100"><path d="M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z"/></svg>`);
        run(hex, [{ transform: "scale(.4)", opacity: 0 }, { offset: 0.3, transform: "scale(1)", opacity: 1 }, { transform: "scale(1.25)", opacity: 0 }], { duration: 650, delay: delay + 80, easing: "ease-out", fill: "both" });
      }
      if (card) run(card, [{ transform: "none", zIndex: 30 }, { offset: 0.12, transform: "translateY(-14px) scale(1.12) rotate(-3deg)", zIndex: 30 }, { offset: 0.3, transform: "translateY(-6px) scale(1.06) rotate(3deg)", zIndex: 30 },
        { offset: 0.45, transform: "translateY(-8px) scale(1.08) rotate(-2deg)", zIndex: 30 }, { transform: "none", zIndex: 30 }], { duration: kind === "counter" ? 420 : 520, delay, easing: "ease-out" });
      return 650;
    }
    case "monster": {
      if (card) run(card, [{ transform: "none", filter: "none", zIndex: 30 }, { offset: 0.35, transform: "translateY(-6px) scale(1.07)", filter: `drop-shadow(0 0 12px ${tone}) brightness(1.3)`, zIndex: 30 }, { transform: "none", filter: "none", zIndex: 30 }], { duration: 700, delay, easing: "ease-out" });
      const aura = bit(layer, "sfx-aura", { ...box(r, 4), "--c": tone }, 800, delay);
      run(aura, [{ opacity: 0, transform: "scale(.95)" }, { offset: 0.3, opacity: 1, transform: "scale(1.05)" }, { opacity: 0, transform: "scale(1.2)" }], { duration: 800, delay, easing: "ease-out", fill: "both" });
      shock(layer, run, r, tone, delay + 80, 1.7, 650, false, 3);
      shock(layer, run, r, tone, delay + 240, 2.2, 700, false, 2);
      embers(layer, run, r, tone, delay + 60);
      return 850;
    }
  }
}

function speedLines(layer: HTMLElement, run: Run, r: R, tone: string, delay: number) {
  const c = ctr(r);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 360 + 22, len = Math.max(r.width, r.height) * 0.9;
    const el = bit(layer, "sfx-speed", { left: `${c.x}px`, top: `${c.y - 1}px`, width: `${len}px`, height: "2px", "--c": tone, transform: `rotate(${a}deg)` }, 450, delay);
    run(el, [{ transform: `rotate(${a}deg) translateX(${len * 0.2}px) scaleX(.2)`, opacity: 0 }, { offset: 0.3, opacity: 1 }, { transform: `rotate(${a}deg) translateX(${len * 0.6}px) scaleX(1)`, opacity: 0 }], { duration: 450, delay, easing: "ease-out", fill: "both" });
  }
}
function spikes(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, n: number) {
  const c = ctr(r);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + (i % 2) * 12, len = Math.max(r.width, r.height) * (0.55 + (i % 3) * 0.12);
    const el = bit(layer, "sfx-spike", { left: `${c.x}px`, top: `${c.y - 3}px`, width: `${len}px`, height: "6px", "--c": tone, transform: `rotate(${a}deg)` }, 420, delay);
    run(el, [{ transform: `rotate(${a}deg) translateX(${len * 0.3}px) scaleX(0)`, opacity: 0 }, { offset: 0.25, transform: `rotate(${a}deg) translateX(${len * 0.45}px) scaleX(1)`, opacity: 1 }, { transform: `rotate(${a}deg) translateX(${len * 0.8}px) scaleX(.3)`, opacity: 0 }],
      { duration: 420, delay, easing: "cubic-bezier(.2,.9,.3,1)", fill: "both" });
  }
}
function embers(layer: HTMLElement, run: Run, r: R, tone: string, delay: number) {
  for (let i = 0; i < 10; i++) {
    const s = 3 + Math.random() * 4, x = r.left + Math.random() * r.width, y = r.top + r.height * (0.4 + Math.random() * 0.6);
    const p = bit(layer, "sfx-spark", { left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${s}px`, "--c": tone }, 900, delay + i * 40);
    run(p, [{ transform: "translateY(0)", opacity: 0 }, { offset: 0.2, opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 20}px, ${-r.height * (0.6 + Math.random() * 0.6)}px)`, opacity: 0 }], { duration: 800, delay: delay + i * 40, easing: "ease-out", fill: "both" });
  }
}

/** The chain drawing itself: a gold line from the previous link's card to this one, with the link number. */
export function chainLine(layer: HTMLElement, run: Run, from: R | null, to: R, link: number, delay: number) {
  const b = ctr(to);
  if (from) {
    const a = ctr(from), len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const el = bit(layer, "sfx-chainline", { left: `${a.x}px`, top: `${a.y - 1.5}px`, width: `${len}px`, height: "3px", transform: `rotate(${ang}deg)` }, 1200, delay);
    run(el, [{ clipPath: "inset(0 100% 0 0)", opacity: 1 }, { offset: 0.35, clipPath: "inset(0 0 0 0)", opacity: 1 }, { offset: 0.75, clipPath: "inset(0 0 0 0)", opacity: 1 }, { clipPath: "inset(0 0 0 100%)", opacity: 0 }],
      { duration: 1200, delay, easing: "ease-in-out", fill: "both" });
  }
  const s = Math.max(22, Math.min(36, to.width * 0.4));
  const tag = bit(layer, "sfx-chaintag", { left: `${to.left + to.width - s * 0.6}px`, top: `${to.top - s * 0.4}px`, width: `${s}px`, height: `${s}px`, fontSize: `${s * 0.52}px` }, 1300, delay + (from ? 380 : 0));
  tag.textContent = String(link);
  run(tag, [{ transform: "scale(2.2)", opacity: 0 }, { offset: 0.2, transform: "scale(1)", opacity: 1 }, { offset: 0.8, transform: "scale(1)", opacity: 1 }, { transform: "scale(.8)", opacity: 0 }], { duration: 1300, delay: delay + (from ? 380 : 0), easing: "ease-out", fill: "both" });
}


// ---------------------------------------------------------------------------------------
// the card-art splash: the card itself, big, before its summon / activation plays on the field

export type { SplashStyle } from "../duelSettings.ts";

/** Splashes don't overlap: each waits for the one before it to be mostly gone. */
let splashFree = 0;

export interface SplashOpts {
  code: number; name: string; kicker: string; tone: string;
  /** the card's zone on screen: the splash comes out of it and goes back into it */
  at: R;
  /** the middle of the field (screen px) */
  center: { x: number; y: number };
  /** the viewer's own card (the showcase rises on their side of the field) */
  mine: boolean;
  big?: boolean;
  short?: boolean;
  style?: SplashStyle;
}
/** The card, big, for a moment. Returns when the board is clear again (ms from now): play the summon /
 *  activation on the field from then. */
export function splash(layer: HTMLElement, run: Run, o: SplashOpts, delay: number): number {
  const now = performance.now();
  const start = Math.max(now + delay, splashFree);
  const wait = start - now;
  const ms = o.short ? 900 : o.big ? 1550 : 1250;
  splashFree = start + ms * 0.8;
  const style = o.style ?? "showcase";
  return style === "portal" ? portal(layer, run, o, wait, ms) : style === "banner" ? banner(layer, run, o, wait, o.short ? 820 : o.big ? 1500 : 1150) : showcase(layer, run, o, wait, ms);
}

/** The card's artwork sweeping across the middle of the board in a slanted band, with its name. */
function banner(layer: HTMLElement, run: Run, o: SplashOpts, wait: number, ms: number): number {
  const h = Math.round(Math.min(220, Math.max(110, innerHeight * (o.big ? 0.22 : 0.16))));
  const from = o.mine ? "left" : "right";
  const el = bit(layer, `sfx-splash ${o.big ? "is-big" : ""} from-${from}`, { top: `${o.center.y - h / 2}px`, height: `${h}px`, "--c": o.tone, "--art": `url("${cardImage(o.code, "crop")}")` }, ms, wait,
    `<div class="sfx-splash-art"></div><div class="sfx-splash-shade"></div><div class="sfx-splash-text"><small></small><b></b></div><i class="sfx-splash-edge t"></i><i class="sfx-splash-edge b"></i>`);
  el.querySelector("small")!.textContent = o.kicker;
  el.querySelector("b")!.textContent = o.name;
  const dir = from === "left" ? -1 : 1;
  run(el, [
    { transform: `skewY(-5deg) translateX(${dir * 105}%)`, opacity: 0 },
    { offset: 0.16, transform: `skewY(-5deg) translateX(${-dir * 2}%)`, opacity: 1 },
    { offset: 0.24, transform: "skewY(-5deg) translateX(0)", opacity: 1 },
    { offset: 0.8, transform: `skewY(-5deg) translateX(${-dir * 3}%)`, opacity: 1 },
    { transform: `skewY(-5deg) translateX(${-dir * 110}%)`, opacity: 0 },
  ], { duration: ms, delay: wait, easing: "cubic-bezier(.3,.7,.3,1)", fill: "both" });
  run(el.querySelector(".sfx-splash-art")!, [{ backgroundPosition: `${50 + dir * 8}% 30%` }, { backgroundPosition: `${50 - dir * 8}% 40%` }], { duration: ms, delay: wait, easing: "linear", fill: "both" });
  run(el.querySelector(".sfx-splash-text")!, [{ transform: `translateX(${dir * 60}px)`, opacity: 0 }, { offset: 0.25, transform: `translateX(${dir * 60}px)`, opacity: 0 }, { offset: 0.38, transform: "translateX(0)", opacity: 1 }, { offset: 0.8, opacity: 1 }, { opacity: 0 }],
    { duration: ms, delay: wait, easing: "ease-out", fill: "both" });
  return wait + ms * 0.66;
}

function showcase(layer: HTMLElement, run: Run, o: SplashOpts, wait: number, ms: number): number {
  const h = Math.round(Math.min(innerHeight * (o.big ? 0.58 : 0.48), o.big ? 640 : 520)), w = Math.round(h * 59 / 86);
  // beside the middle of the field, on the player's side
  const cx = o.center.x + (o.mine ? -1 : 1) * Math.min(innerWidth * 0.17, w * 1.15), cy = o.center.y - h * 0.06;
  const el = bit(layer, `sfx-show ${o.big ? "is-big" : ""}`, { left: `${cx - w / 2}px`, top: `${cy - h / 2}px`, width: `${w}px`, height: `${h}px`, "--c": o.tone }, ms, wait,
    `<div class="sfx-show-glow"></div><div class="sfx-show-rays"></div><div class="sfx-show-card"><img alt="" src="${cardImage(o.code, "full")}"><i class="sfx-show-sheen"></i></div><div class="sfx-show-plate"><small></small><b></b></div>`);
  el.querySelector("small")!.textContent = o.kicker;
  el.querySelector("b")!.textContent = o.name;
  // out of the zone, up, a slow turn, back down into the zone
  const z = ctr(o.at), dx = z.x - cx, dy = z.y - cy, s0 = Math.max(0.12, o.at.height / h);
  const tilt = o.mine ? 1 : -1;
  run(el.querySelector(".sfx-show-card")!, [
    { transform: `translate(${dx}px, ${dy}px) scale(${s0}) rotateY(${70 * tilt}deg)`, opacity: 0.3 },
    { offset: 0.2, transform: `translate(0, -8px) scale(1.04) rotateY(${-10 * tilt}deg)`, opacity: 1 },
    { offset: 0.3, transform: `translate(0, 0) scale(1) rotateY(${-6 * tilt}deg)`, opacity: 1 },
    { offset: 0.72, transform: `translate(0, -6px) scale(1.02) rotateY(${6 * tilt}deg)`, opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(${s0}) rotateY(0deg)`, opacity: 0 },
  ], { duration: ms, delay: wait, easing: "cubic-bezier(.45,0,.25,1)", fill: "both" });
  run(el.querySelector(".sfx-show-sheen")!, [{ transform: "translateX(-120%) skewX(-18deg)" }, { offset: 0.3, transform: "translateX(-120%) skewX(-18deg)" }, { offset: 0.6, transform: "translateX(320%) skewX(-18deg)" }, { transform: "translateX(320%) skewX(-18deg)" }],
    { duration: ms, delay: wait, easing: "ease-in-out", fill: "both" });
  for (const sel of [".sfx-show-glow", ".sfx-show-rays"]) {
    run(el.querySelector(sel)!, [{ opacity: 0, transform: "scale(.4) rotate(0deg)" }, { offset: 0.25, opacity: 1, transform: "scale(1) rotate(20deg)" }, { offset: 0.7, opacity: 1, transform: "scale(1.05) rotate(70deg)" }, { opacity: 0, transform: "scale(.6) rotate(110deg)" }],
      { duration: ms, delay: wait, easing: "ease-out", fill: "both" });
  }
  run(el.querySelector(".sfx-show-plate")!, [{ opacity: 0, transform: "translate(-50%, 10px)" }, { offset: 0.28, opacity: 0, transform: "translate(-50%, 10px)" }, { offset: 0.38, opacity: 1, transform: "translate(-50%, 0)" }, { offset: 0.72, opacity: 1, transform: "translate(-50%, 0)" }, { opacity: 0, transform: "translate(-50%, 4px)" }],
    { duration: ms, delay: wait, easing: "ease-out", fill: "both" });
  return wait + ms * 0.82;
}

function portal(layer: HTMLElement, run: Run, o: SplashOpts, wait: number, ms: number): number {
  const d = Math.round(Math.min(innerHeight * (o.big ? 0.48 : 0.38), o.big ? 520 : 420));
  const z = ctr(o.at);
  // centred on the zone, kept on screen
  const cx = Math.min(innerWidth - d / 2 - 12, Math.max(d / 2 + 12, z.x)), cy = Math.min(innerHeight - d / 2 - 60, Math.max(d / 2 + 12, z.y));
  const el = bit(layer, `sfx-portal ${o.big ? "is-big" : ""}`, { left: `${cx - d / 2}px`, top: `${cy - d / 2}px`, width: `${d}px`, height: `${d}px`, "--c": o.tone, "--art": `url("${cardImage(o.code, "crop")}")` }, ms, wait,
    `<div class="sfx-portal-art"></div><div class="sfx-portal-ring">${circleSvg(8)}</div><div class="sfx-portal-plate"><small></small><b></b></div>`);
  el.querySelector("small")!.textContent = o.kicker;
  el.querySelector("b")!.textContent = o.name;
  run(el.querySelector(".sfx-portal-art")!, [
    { clipPath: "circle(0% at 50% 50%)", transform: "scale(1.25)" },
    { offset: 0.25, clipPath: "circle(46% at 50% 50%)", transform: "scale(1.08)" },
    { offset: 0.75, clipPath: "circle(46% at 50% 50%)", transform: "scale(1)" },
    { clipPath: "circle(0% at 50% 50%)", transform: "scale(.96)" },
  ], { duration: ms, delay: wait, easing: "cubic-bezier(.5,0,.3,1)", fill: "both" });
  run(el.querySelector(".sfx-portal-ring")!, [{ transform: "rotate(-90deg) scale(.2)", opacity: 0 }, { offset: 0.25, transform: "rotate(0deg) scale(1)", opacity: 1 }, { offset: 0.75, transform: "rotate(60deg) scale(1)", opacity: 1 }, { transform: "rotate(120deg) scale(.15)", opacity: 0 }],
    { duration: ms, delay: wait, easing: "cubic-bezier(.5,0,.3,1)", fill: "both" });
  run(el.querySelector(".sfx-portal-plate")!, [{ opacity: 0, transform: "translate(-50%, 8px)" }, { offset: 0.25, opacity: 0, transform: "translate(-50%, 8px)" }, { offset: 0.35, opacity: 1, transform: "translate(-50%, 0)" }, { offset: 0.72, opacity: 1, transform: "translate(-50%, 0)" }, { opacity: 0, transform: "translate(-50%, 0)" }],
    { duration: ms, delay: wait, easing: "ease-out", fill: "both" });
  return wait + ms * 0.85;
}
