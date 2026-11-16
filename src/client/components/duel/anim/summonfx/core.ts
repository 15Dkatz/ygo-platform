// Shared by the summon / activation / splash effects: the speed setting, sound in step, kinds and tones,
// and the small building blocks (bursts, shockwaves, columns, runes...).
import type { Card } from "../../../../../shared/types.ts";
import { play as playSfx, type PlayOpts, type Sfx } from "../sfx.ts";
/** Animation speed (the duel setting): the animator scales every animation it runs; the timers here
 *  (sounds in step, the splash queue) follow it too. */
export let speed = 1;
export function setFxSpeed(s: number) { speed = s > 0 ? s : 1; }
export const sfx = (name: Sfx, o: PlayOpts = {}) => playSfx(name, { ...o, inMs: o.inMs ? o.inMs / speed : 0 });
import "../summon-fx.css";

export type Run = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => Animation;
export type R = { left: number; top: number; width: number; height: number };

export type SummonKind = "normal" | "tribute" | "set" | "flip" | "special" | "ritual" | "fusion" | "synchro" | "xyz" | "link" | "pendulum";
export type ActivateKind = "spell" | "quick" | "trap" | "counter" | "monster";

export const SUMMON_LABEL: Record<SummonKind, string> = {
  normal: "Normal Summon", tribute: "Tribute Summon", set: "Set", flip: "Flip Summon", special: "Special Summon", ritual: "Ritual Summon",
  fusion: "Fusion Summon", synchro: "Synchro Summon", xyz: "Xyz Summon", link: "Link Summon", pendulum: "Pendulum Summon",
};
export const ACTIVATE_LABEL: Record<ActivateKind, string> = { spell: "Spell Card", quick: "Quick-Play Spell", trap: "Trap Card", counter: "Counter Trap", monster: "Monster Effect" };

/** The colour of each summon / activation, used by its effect and its splash. */
export const TONE: Record<SummonKind | ActivateKind, string> = {
  normal: "#f2c14e", tribute: "#ff9f43", set: "#6f8fd8", flip: "#f2c14e", special: "#8fd0ff", ritual: "#5b8cff",
  fusion: "#b46bff", synchro: "#e9f6ff", xyz: "#e6c35c", link: "#3fa9ff", pendulum: "#3fe0b0",
  spell: "#20c997", quick: "#20c997", trap: "#e0457b", counter: "#ff5c8a", monster: "#ffb347",
};
export const ATTR_TONE: Record<string, string> = { DARK: "#a35cff", LIGHT: "#ffe58a", FIRE: "#ff6a2a", WATER: "#3fa9ff", EARTH: "#c7964a", WIND: "#5fe39a", DIVINE: "#ffd700" };
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

export function bit(layer: HTMLElement, cls: string, style: Partial<CSSStyleDeclaration> & Record<string, string>, ms: number, delay: number, html = ""): HTMLDivElement {
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
export const ctr = (r: R) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
/** A square box centred on the card, `k` times its larger side. */
export const sq = (r: R, k: number) => { const s = Math.max(r.width, r.height) * k, c = ctr(r); return { left: `${c.x - s / 2}px`, top: `${c.y - s / 2}px`, width: `${s}px`, height: `${s}px` }; };
export const box = (r: R, pad = 0) => ({ left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });

/** Particles flying out from the card's centre. */
export function burst(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, n = 14, reach = 1.1, ms = 700) {
  const c = ctr(r), base = Math.max(r.width, r.height) * reach;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = base * (0.6 + Math.random() * 0.6), s = 3 + Math.random() * 4;
    const p = bit(layer, "sfx-spark", { left: `${c.x - s / 2}px`, top: `${c.y - s / 2}px`, width: `${s}px`, height: `${s}px`, "--c": tone }, ms, delay);
    run(p, [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.3)`, opacity: 0 }],
      { duration: ms * (0.7 + Math.random() * 0.4), delay, easing: "cubic-bezier(.15,.7,.3,1)", fill: "both" });
  }
}
/** Ring(s) expanding from the card. `flat` squashes them onto the table. */
export function shock(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, k = 1.6, ms = 650, flat = false, width = 3) {
  const el = bit(layer, "sfx-shock", { ...sq(r, 0.9), "--c": tone, "--w": `${width}px` }, ms, delay);
  const f = flat ? "scaleY(.42)" : "";
  run(el, [{ transform: `${f} scale(.3)`, opacity: 0 }, { offset: 0.15, opacity: 1 }, { transform: `${f} scale(${k})`, opacity: 0 }], { duration: ms, delay, easing: "cubic-bezier(.2,.8,.3,1)", fill: "both" });
}
/** Light sweeping up the card. */
export function sweep(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, ms = 520) {
  const el = bit(layer, "sfx-sweep", { ...box(r), "--c": tone }, ms, delay);
  run(el, [{ backgroundPosition: "0 140%", opacity: 0 }, { offset: 0.2, opacity: 1 }, { backgroundPosition: "0 -40%", opacity: 0 }], { duration: ms, delay, easing: "ease-in-out", fill: "both" });
}
/** The whole board / stage shakes a little. */
export function quake(target: Element | null, run: Run, delay: number, power = 4) {
  if (!target) return;
  run(target, [{ transform: "none" }, { offset: 0.15, transform: `translate(${-power}px, ${power / 2}px)` }, { offset: 0.35, transform: `translate(${power}px, ${-power / 2}px)` },
    { offset: 0.6, transform: `translate(${-power / 2}px, 0)` }, { offset: 0.8, transform: `translate(${power / 3}px, ${power / 4}px)` }, { transform: "none" }], { duration: 340, delay, easing: "ease-out" });
}
/** A soft column of light rising from the card. */
export function column(layer: HTMLElement, run: Run, r: R, tone: string, delay: number, ms = 800, hk = 2.6) {
  const c = ctr(r), w = r.width * 0.9, h = r.height * hk;
  const el = bit(layer, "sfx-column", { left: `${c.x - w / 2}px`, top: `${c.y - h + r.height * 0.3}px`, width: `${w}px`, height: `${h}px`, "--c": tone }, ms, delay);
  run(el, [{ transform: "scaleX(.2) scaleY(.1)", opacity: 0 }, { offset: 0.3, transform: "scaleX(1) scaleY(1)", opacity: 1 }, { transform: "scaleX(.1) scaleY(1.1)", opacity: 0 }], { duration: ms, delay, easing: "ease-out", fill: "both" });
}
/** The real card: dropping in from above and landing. */
export function land(card: HTMLElement | null, run: Run, delay: number, heavy: boolean) {
  if (!card) return;
  run(card, [
    { transform: `translateY(${heavy ? -46 : -30}px) scale(${heavy ? 1.3 : 1.18})`, filter: "brightness(1.8)", zIndex: 30 },
    { offset: 0.55, transform: "translateY(0) scale(1)", filter: "brightness(1.3)", zIndex: 30 },
    { offset: 0.7, transform: "scale(1.04, .94)", zIndex: 30 },
    { transform: "none", filter: "none", zIndex: 30 },
  ], { duration: heavy ? 520 : 420, delay, easing: "cubic-bezier(.5,0,.4,1)" });
}
/** The real card: rising out of light. */
export function rise(card: HTMLElement | null, run: Run, delay: number, ms = 600) {
  if (!card) return;
  run(card, [
    { transform: "scale(.6)", filter: "brightness(3) saturate(0)", opacity: 0, zIndex: 30 },
    { offset: 0.5, transform: "scale(1.12)", filter: "brightness(1.8)", opacity: 1, zIndex: 30 },
    { transform: "none", filter: "none", opacity: 1, zIndex: 30 },
  ], { duration: ms, delay, easing: "cubic-bezier(.2,.8,.3,1.2)" });
}

export const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
export function runeRing(n: number, r: number): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360;
    s += `<text x="50" y="${50 - r}" transform="rotate(${a} 50 50)" text-anchor="middle" dominant-baseline="middle">${RUNES[(i * 7) % RUNES.length]}</text>`;
  }
  return s;
}
/** A magic circle: two rings, runes, a star. */
export function circleSvg(points = 6): string {
  const star: string[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2, b = ((i + 2) / points) * Math.PI * 2 - Math.PI / 2;
    star.push(`M${50 + 34 * Math.cos(a)} ${50 + 34 * Math.sin(a)}L${50 + 34 * Math.cos(b)} ${50 + 34 * Math.sin(b)}`);
  }
  return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" class="o"/><circle cx="50" cy="50" r="41" class="i"/><g class="runes">${runeRing(18, 44)}</g>
<path d="${star.join("")}" class="s"/><circle cx="50" cy="50" r="12" class="i"/></svg>`;
}

