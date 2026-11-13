// Plays animation intents (intents.ts) on the duel board with the Web Animations API.
//
//   capture(intents)  — call while the DOM still shows the OLD board: records where every card
//                       and zone is on screen.
//   play()            — call right after React committed the NEW board (useLayoutEffect):
//                       FLIPs real card elements from their old spot, flies ghost cards to piles,
//                       rotates, shuffles, lunges.
//
// Nothing here blocks input: animations are transforms on elements that stay clickable, ghosts
// live in a pointer-events:none layer, and every timeline is capped well under a second.
// prefers-reduced-motion: no motion at all (the board just updates); sounds still play.

import type { Position } from "../../../../shared/duel.ts";
import { getCard } from "../useDuel.ts";
import { attackStyle } from "./categories.ts";
import * as fx from "./fx.ts";
import type { Intent, Spot } from "./intents.ts";
import { play as sfx, type Sfx } from "./sfx.ts";

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const MOVE_MS = 330, ROTATE_MS = 280, SHUFFLE_MS = 420, ATTACK_MS = 440, PULSE_MS = 600;
/** Gap between consecutive intents of one update, and the cap on the whole timeline's start offsets. */
const STAGGER: Record<Intent["t"], number> = { effect: 160, banner: 120, move: 90, rotate: 60, shuffle: 80, attack: 380, pulse: 40, excavate: 600 };
const MAX_OFFSET = 800;

type Rects = Map<string, DOMRect>;

function zoneKeyOf(el: HTMLElement): string {
  const { zone, player, slot } = el.dataset;
  if (zone === "extraMonster") return `extraMonster:${slot ?? 0}`;
  return `${zone}:${player}:${slot ?? ""}`;
}

const posTransform = (p?: Position) => (p === "def" || p === "faceDownDef" ? "rotate(90deg) scale(.7)" : "none");
const center = fx.center;

export class BoardAnimator {
  root: HTMLElement | null = null;
  private pending: { intents: Intent[]; rects: Rects; flipRest: boolean } | null = null;
  /** Count of animations started (debug / tests). */
  played = 0;

  /** Record the current layout for `intents`. Merges with a capture that hasn't been played yet. */
  capture(intents: Intent[], flipRest = false) {
    if (!this.root) { this.pending = null; return; }
    if (this.pending) {   // two updates before one render: the DOM still shows the first layout
      this.pending.intents.push(...intents);
      this.pending.flipRest ||= flipRest;
      return;
    }
    this.pending = { intents: [...intents], rects: reducedMotion() ? new Map() : this.measure(), flipRest };
  }

  private measure(): Rects {
    const rects: Rects = new Map();
    const root = this.root!;
    root.querySelectorAll<HTMLElement>("[data-zone]").forEach((el) => rects.set(`zone:${zoneKeyOf(el)}`, el.getBoundingClientRect()));
    root.querySelectorAll<HTMLElement>(".duel-card[data-uid]").forEach((el) => {
      if (!el.closest(".duel-modal")) rects.set(`uid:${el.dataset.uid}`, el.getBoundingClientRect());
    });
    return rects;
  }

  private el(uid: string): HTMLElement | null {
    return this.root?.querySelector<HTMLElement>(`.duel-board-wrap .duel-card[data-uid="${CSS.escape(uid)}"], .duel-pendulum .duel-card[data-uid="${CSS.escape(uid)}"]`) ?? null;
  }
  private zoneEl(key: string): HTMLElement | null {
    if (!this.root) return null;
    for (const el of this.root.querySelectorAll<HTMLElement>("[data-zone]")) if (zoneKeyOf(el) === key) return el;
    return null;
  }
  private fromRect(rects: Rects, s: Spot): DOMRect | undefined {
    return (s.uid && rects.get(`uid:${s.uid}`)) || rects.get(`zone:${s.zone}`);
  }
  private nowRect(s: Spot): DOMRect | undefined {
    const el = (s.uid && this.el(s.uid)) || this.zoneEl(s.zone);
    return el?.getBoundingClientRect();
  }

  /** Run what `capture` recorded against the freshly rendered board. */
  play() {
    const p = this.pending;
    this.pending = null;
    if (!p || !this.root) return;
    this.sounds(p.intents);
    if (reducedMotion()) return;
    const flipped = new Set<string>();
    let offset = 0;
    const total = p.intents.reduce((t, i) => t + STAGGER[i.t], 0);
    const squeeze = total > MAX_OFFSET ? MAX_OFFSET / total : 1;
    for (const it of p.intents) {
      const delay = Math.round(offset);
      offset += STAGGER[it.t] * squeeze;
      try {
        switch (it.t) {
          case "move": this.move(p.rects, it, delay, flipped); break;
          case "rotate": this.rotate(it, delay); break;
          case "shuffle": this.shuffle(it.zone, delay); break;
          case "excavate": this.excavate(it.zone, it.codes, delay); break;
          case "attack": this.attack(it.attacker, it.target, it.side, delay, false, it.code); break;
          case "effect": this.effect(p.rects, it, delay); break;
          case "pulse": this.pulse(it.uid, it.tone, delay); break;
          case "banner": this.banner(it.text, delay); break;
        }
      } catch (e) { console.warn("animation", e); }
    }
    if (p.flipRest) this.flipRest(p.rects, flipped);
  }

  /** One sound per kind of thing that happened, in timeline order. */
  private sounds(intents: Intent[]) {
    const seen = new Set<Sfx>();
    let offset = 0;
    for (const it of intents) {
      let s: Sfx | null = null;
      if (it.t === "move") {
        const to = it.to.zone.split(":")[0], from = it.from.zone.split(":")[0];
        s = from === "deck" && to === "hand" ? "draw"
          : to === "monster" || to === "extraMonster" ? (it.faceUp ? "summon" : "set")
          : to === "spelltrap" || to === "field" ? (it.faceUp ? "chain" : "set")
          : null;
        if (it.style === "shatter") s = "damage";
        if (it.style === "tribute" || it.style === "material") s = "resolve";
        if (it.style === "send" || it.style === "mill") s = "set";
      } else if (it.t === "attack") s = "attack";
      else if (it.t === "effect") s = it.kind === "negate" ? "damage" : it.kind === "burn" ? "damage" : it.kind === "revive" || it.kind === "search" ? "gain" : "chain";
      else if (it.t === "shuffle") s = "shuffle";
      else if (it.t === "excavate") s = "draw";
      else if (it.t === "pulse") s = it.tone === "activate" ? "chain" : it.tone === "resolve" ? "resolve" : null;
      else if (it.t === "rotate" && it.reveal) s = "summon";
      if (s && !seen.has(s)) {
        seen.add(s);
        const name = s;
        setTimeout(() => sfx(name), Math.min(offset, MAX_OFFSET));
      }
      offset += STAGGER[it.t];
    }
  }

  /** Manual mode: every other card that changed place (hand reflow, ...) slides there. */
  private flipRest(rects: Rects, done: Set<string>) {
    this.root!.querySelectorAll<HTMLElement>(".duel-board-wrap .duel-card[data-uid]").forEach((el) => {
      const uid = el.dataset.uid!;
      if (done.has(uid)) return;
      const was = rects.get(`uid:${uid}`);
      if (!was) return;
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left, dy = was.top - now.top;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      this.run(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 220, easing: "ease-out" });
    });
  }

  private run(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) {
    this.played++;
    return el.animate(frames, { fill: "backwards", ...opts });
  }

  private move(rects: Rects, it: Extract<Intent, { t: "move" }>, delay: number, flipped: Set<string>) {
    const from = this.fromRect(rects, it.from);
    if (!from) return;
    const layer = this.layer();
    const run = this.run.bind(this);
    // destroyed cards shatter where they stood, banished ones dissolve: no flight to the pile
    if (layer && (it.style === "shatter" || it.style === "dissolve") && !it.to.zone.startsWith("hand")) {
      (it.style === "shatter" ? fx.shatter : fx.dissolve)(layer, run, from, it.code, it.faceUp || it.code > 0, delay);
      if (it.to.uid) flipped.add(it.to.uid);
      return;
    }
    // tributes rise away where they stood; materials fly into the monster they become
    if (layer && it.style === "tribute") { fx.ascend(layer, run, from, it.code, it.faceUp || it.code > 0, delay); if (it.to.uid) flipped.add(it.to.uid); return; }
    if (layer && it.style === "material" && it.via) {
      const into = this.nowRect(it.via);
      if (into) { fx.converge(layer, run, from, into, it.code, it.faceUp || it.code > 0, delay); if (it.to.uid) flipped.add(it.to.uid); return; }
    }
    if (layer && (it.style === "send" || it.style === "mill")) {
      const to = this.nowRect(it.to);
      if (to) { fx.arcTo(layer, run, from, to, it.code, it.faceUp || it.code > 0, delay, it.style === "mill"); if (it.to.uid) flipped.add(it.to.uid); return; }
    }
    if (layer && it.style === "whoosh") fx.whoosh(layer, run, from, delay);
    if (layer && it.style === "pillar") { const to = this.nowRect(it.to); if (to) fx.pillar(layer, run, to, delay + 120); }
    if (layer && it.style === "sparkle") { const to = this.nowRect(it.to); if (to) fx.sparkle(layer, run, from, to, delay); }
    const target = it.flip && it.to.uid && !flipped.has(it.to.uid) ? this.el(it.to.uid) : null;
    if (target) {
      flipped.add(it.to.uid!);
      const to = target.getBoundingClientRect();
      if (!to.width) return;
      const a = center(from), b = center(to);
      const dx = a.x - b.x, dy = a.y - b.y, s = Math.max(0.4, Math.min(2.5, from.width / to.width));
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      const start = `translate(${dx}px, ${dy}px) scale(${s})`;
      const frames: Keyframe[] = it.reveal
        ? [{ transform: start, zIndex: 30 }, { offset: 0.6, transform: "translate(0, 0) scale(1.06)", zIndex: 30 }, { offset: 0.8, transform: "scaleX(0.08) scaleY(1.04)", zIndex: 30 }, { transform: "none", zIndex: 30 }]
        : [{ transform: start, zIndex: 30 }, { offset: 0.85, transform: "scale(1.04)", zIndex: 30 }, { transform: "none", zIndex: 30 }];
      this.run(target, frames, { duration: it.reveal ? MOVE_MS + 80 : MOVE_MS, delay, easing: "cubic-bezier(.2,.7,.3,1)" });
      return;
    }
    const to = this.nowRect(it.to);
    if (!to) return;
    this.ghost(from, to, it.code, it.faceUp, delay);
  }

  /** A card-shaped element that flies from -> to above the board, then disappears. */
  private ghost(from: DOMRect, to: DOMRect, code: number, faceUp: boolean, delay: number) {
    const layer = this.layer();
    if (!layer) return;
    const w = from.width || to.width, h = from.height || to.height;
    const g = fx.cardEl(code, faceUp, { left: from.left, top: from.top, width: w, height: h });
    layer.appendChild(g);
    // aim at the target's centre, scaled to its size (piles are card sized; zones a bit bigger)
    const tw = Math.min(to.width, to.height * (59 / 86)) || w;
    const s = tw / w;
    const dx = to.left + to.width / 2 - (from.left + w / 2), dy = to.top + to.height / 2 - (from.top + h / 2);
    const anim = this.run(g, [
      { transform: "none", opacity: 1 },
      { offset: 0.85, transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 },
    ], { duration: MOVE_MS + 40, delay, easing: "cubic-bezier(.3,.6,.3,1)", fill: "both" });
    const done = () => g.remove();
    anim.onfinish = done;
    anim.oncancel = done;
    setTimeout(done, MOVE_MS + delay + 600);   // in case the tab was hidden
  }

  private layer(): HTMLElement | null {
    if (!this.root) return null;
    let l = this.root.querySelector<HTMLElement>(":scope > .duel-anim-layer");
    if (!l) {
      l = document.createElement("div");
      l.className = "duel-anim-layer";
      l.setAttribute("aria-hidden", "true");
      this.root.appendChild(l);
    }
    return l;
  }

  private rotate(it: Extract<Intent, { t: "rotate" }>, delay: number) {
    const el = this.el(it.uid);
    const inner = el?.querySelector(".duel-card-inner");
    if (!inner) return;
    const a = posTransform(it.from), b = posTransform(it.to);
    if (a === b && !it.reveal) return;
    const mid = b === "none" ? "" : b;
    const frames: Keyframe[] = it.reveal
      ? [{ transform: a }, { offset: 0.5, transform: `${mid} scaleX(0.05)`.trim() }, { transform: b }]
      : [{ transform: a }, { transform: b }];
    this.run(inner, frames, { duration: ROTATE_MS, delay, easing: "ease-in-out" });
  }

  /** Excavated cards lift off the Deck, fan out face-up above it, then settle back. */
  private excavate(zone: string, codes: number[], delay: number) {
    const deck = this.zoneEl(zone)?.getBoundingClientRect();
    const layer = this.layer();
    if (!deck || !layer || !codes.length) return;
    fx.fan(layer, this.run.bind(this), deck, codes, delay);
  }

  /** Shuffle wiggle + sound for one zone, outside a captured board update (e.g. a local hand shuffle). */
  shuffleZone(zone: string) {
    sfx("shuffle");
    if (!reducedMotion()) this.shuffle(zone, 0);
  }

  private shuffle(zone: string, delay: number) {
    const z = this.zoneEl(zone);
    if (!z) return;
    const cards = [...z.querySelectorAll<HTMLElement>(".duel-card")];
    cards.forEach((c, i) => {
      const dir = i % 2 ? -1 : 1;
      this.run(c, [
        { transform: "none" },
        { offset: 0.2, transform: `translateX(${8 * dir}px) rotate(${5 * dir}deg)` },
        { offset: 0.45, transform: `translateX(${-7 * dir}px) rotate(${-4 * dir}deg)` },
        { offset: 0.7, transform: `translateX(${5 * dir}px) rotate(${3 * dir}deg)` },
        { transform: "none" },
      ], { duration: SHUFFLE_MS, delay: delay + Math.min(i, 6) * 25, easing: "ease-in-out" });
    });
  }

  /** The attacker lunges at its target (or at the defending player's side) and back. Usable without a capture. */
  attack(attackerUid: string, targetUid: string | null, side: 0 | 1, delay = 0, sound = false, code?: number) {
    if (sound) sfx("attack");
    if (!this.root || reducedMotion()) return;
    const a = this.el(attackerUid);
    if (!a) return;
    const t = targetUid ? this.el(targetUid) : (this.plate(side) ?? this.zoneEl(`hand:${side}:`));
    const ar = a.getBoundingClientRect();
    const tr = t?.getBoundingClientRect();
    if (!tr) return;
    const p = center(ar), q = center(tr);
    const dx = (q.x - p.x) * 0.72, dy = (q.y - p.y) * (targetUid ? 0.72 : 0.5);
    this.arrow(p, q, delay);
    const layer = this.layer();
    if (layer) {
      const { element, shape } = attackStyle(code ? getCard(code) : null);
      const hitIn = fx.strike(layer, this.run.bind(this), ar, tr, element, shape, delay + 120);
      fx.impact(layer, this.run.bind(this), tr, element, delay + 120 + hitIn);
    }
    this.run(a, [
      { transform: "none", zIndex: 30 },
      { offset: 0.25, transform: `translate(${-dx * 0.08}px, ${-dy * 0.08}px) scale(1.06)`, zIndex: 30 },
      { offset: 0.5, transform: `translate(${dx}px, ${dy}px) scale(1.12)`, zIndex: 30 },
      { transform: "none", zIndex: 30 },
    ], { duration: ATTACK_MS, delay, easing: "ease-in-out" });
    if (t && targetUid) {
      this.run(t, [
        { transform: "none" }, { offset: 0.3, transform: "translateX(-5px) rotate(-2deg)" },
        { offset: 0.6, transform: "translateX(5px) rotate(2deg)" }, { transform: "none" },
      ], { duration: 220, delay: delay + ATTACK_MS * 0.45, easing: "ease-in-out" });
    }
  }

  /** The Life Points plate of a seat (burn / direct attack target). */
  private plate(seat: number): HTMLElement | null {
    return this.root?.querySelector<HTMLElement>(`.duel-playerbar[data-seat="${seat}"] .duel-lp`) ?? null;
  }

  /** A card effect's category visual. */
  private effect(rects: Rects, it: Extract<Intent, { t: "effect" }>, delay: number) {
    const layer = this.layer();
    if (!layer) return;
    const run = this.run.bind(this);
    const rectOf = (s: Spot) => this.fromRect(rects, s) ?? this.nowRect(s);
    const src = it.source ? (rects.get(`uid:${it.source}`) ?? this.el(it.source)?.getBoundingClientRect()) : undefined;
    const targets = it.targets.map(rectOf).filter((r): r is DOMRect => !!r && r.width > 0);
    switch (it.kind) {
      case "wipe": {
        const field = this.root!.querySelector(".duel-field")?.getBoundingClientRect();
        if (!field) return;
        const half = it.side === undefined ? field : this.sideRect(field, it.side);
        fx.vortex(layer, run, half, delay);
        return;
      }
      case "trapHole": targets.forEach((r) => fx.pit(layer, run, r, delay)); return;
      case "negate": targets.forEach((r) => fx.stamp(layer, run, r, delay)); return;
      case "destroy": targets.forEach((r) => fx.ring(layer, run, r, delay, "tone-danger")); return;
      case "banish": targets.forEach((r) => fx.ring(layer, run, r, delay, "tone-void")); return;
      case "bounce": targets.forEach((r) => fx.whoosh(layer, run, r, delay)); return;
      case "burn": {
        const to = it.to !== undefined ? this.plate(it.to)?.getBoundingClientRect() : undefined;
        if (src && to) fx.fireball(layer, run, src, to, delay);
        else if (src) fx.ring(layer, run, src, delay, "tone-fire");
        return;
      }
      case "handtrap": {
        const el = it.source ? this.el(it.source) : null;
        if (el) run(el, [{ transform: "none", zIndex: 30 }, { offset: 0.4, transform: "translateY(-28px) scale(1.35)", zIndex: 30 }, { offset: 0.7, transform: "translateY(-18px) scale(1.25)", zIndex: 30 }, { transform: "none", zIndex: 30 }], { duration: 520, delay, easing: "cubic-bezier(.3,1.4,.5,1)" });
        if (src) fx.ring(layer, run, src, delay + 200, "tone-accent");
        return;
      }
      case "revive": case "search": if (src) fx.ring(layer, run, src, delay, "tone-light"); return;
      default: if (src) fx.ring(layer, run, src, delay, "tone-accent");
    }
  }

  /** The half of the field that belongs to `seat` (top half = the opponent of the viewer). */
  private sideRect(field: DOMRect, seat: number): DOMRect {
    const mine = this.root?.querySelector<HTMLElement>(`.duel-field [data-zone="monster"][data-player="${seat}"]`);
    const z = mine?.getBoundingClientRect();
    const top = z ? z.top < field.top + field.height / 2 : false;
    return new DOMRect(field.left, top ? field.top : field.top + field.height / 2, field.width, field.height / 2);
  }

  /** A line from the attacker to its target that draws itself, then fades. */
  private arrow(p: { x: number; y: number }, q: { x: number; y: number }, delay: number) {
    const layer = this.layer();
    if (!layer) return;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "duel-attack-arrow");
    svg.setAttribute("width", String(innerWidth));
    svg.setAttribute("height", String(innerHeight));
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(p.x)); line.setAttribute("y1", String(p.y));
    line.setAttribute("x2", String(q.x)); line.setAttribute("y2", String(q.y));
    line.setAttribute("stroke-dasharray", String(len));
    line.setAttribute("marker-end", "url(#duel-arrowhead)");
    const defs = document.createElementNS(NS, "defs");
    const marker = document.createElementNS(NS, "marker");
    marker.setAttribute("id", "duel-arrowhead"); marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "6"); marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "5"); marker.setAttribute("markerHeight", "5"); marker.setAttribute("orient", "auto-start-reverse");
    const head = document.createElementNS(NS, "path");
    head.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    marker.appendChild(head); defs.appendChild(marker); svg.appendChild(defs); svg.appendChild(line);
    layer.appendChild(svg);
    this.run(line, [{ strokeDashoffset: len }, { offset: 0.4, strokeDashoffset: 0 }, { strokeDashoffset: 0 }], { duration: ATTACK_MS + 200, delay, easing: "ease-out", fill: "both" });
    const fade = this.run(svg, [{ opacity: 1 }, { offset: 0.7, opacity: 1 }, { opacity: 0 }], { duration: ATTACK_MS + 260, delay, fill: "both" });
    const done = () => svg.remove();
    fade.onfinish = done; fade.oncancel = done;
    setTimeout(done, ATTACK_MS + delay + 900);
  }

  /** A short centred text ribbon over the board (chain resolving, ...). */
  private banner(text: string, delay: number) {
    const layer = this.layer();
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "duel-ribbon";
    el.textContent = text;
    layer.appendChild(el);
    const a = this.run(el, [
      { opacity: 0, transform: "translate(-50%, -50%) scaleX(.6)" },
      { offset: 0.2, opacity: 1, transform: "translate(-50%, -50%) scaleX(1)" },
      { offset: 0.8, opacity: 1, transform: "translate(-50%, -50%) scaleX(1)" },
      { opacity: 0, transform: "translate(-50%, -50%) scaleX(1.05)" },
    ], { duration: 900, delay, fill: "both" });
    const done = () => el.remove();
    a.onfinish = done; a.oncancel = done;
    setTimeout(done, delay + 1500);
  }

  /** Brief shake of the whole board (damage). */
  shake() {
    const b = this.root?.querySelector(".duel-board-wrap");
    if (!b || reducedMotion()) return;
    this.run(b, [
      { transform: "none" }, { offset: 0.2, transform: "translate(-4px, 1px)" }, { offset: 0.4, transform: "translate(4px, -1px)" },
      { offset: 0.6, transform: "translate(-3px, 0)" }, { offset: 0.8, transform: "translate(2px, 1px)" }, { transform: "none" },
    ], { duration: 320, easing: "ease-in-out" });
  }

  private pulse(uid: string, tone: "activate" | "summon" | "target" | "resolve", delay: number) {
    const el = this.el(uid);
    if (!el) return;
    const color = tone === "target" ? "var(--danger)" : tone === "summon" ? "var(--ok)" : tone === "resolve" ? "var(--warn)" : "var(--accent)";
    this.run(el, [
      { boxShadow: `0 0 0 0 ${color}` },
      { offset: 0.4, boxShadow: `0 0 0 5px ${color}` },
      { boxShadow: "0 0 0 10px transparent" },
    ], { duration: PULSE_MS, delay: delay + (tone === "summon" ? MOVE_MS - 60 : 0), easing: "ease-out" });
  }
}
