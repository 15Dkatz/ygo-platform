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
// prefers-reduced-motion: nothing is captured or played (the board just updates).

import { cardImage } from "../../../api.ts";
import type { Position } from "../../../../shared/duel.ts";
import type { Intent, Spot } from "./intents.ts";

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const MOVE_MS = 330, ROTATE_MS = 280, SHUFFLE_MS = 420, ATTACK_MS = 440, PULSE_MS = 600;
/** Gap between consecutive intents of one update, and the cap on the whole timeline's start offsets. */
const STAGGER: Record<Intent["t"], number> = { move: 90, rotate: 60, shuffle: 80, attack: 380, pulse: 40 };
const MAX_OFFSET = 800;

type Rects = Map<string, DOMRect>;

function zoneKeyOf(el: HTMLElement): string {
  const { zone, player, slot } = el.dataset;
  if (zone === "extraMonster") return `extraMonster:${slot ?? 0}`;
  return `${zone}:${player}:${slot ?? ""}`;
}

const posTransform = (p?: Position) => (p === "def" || p === "faceDownDef" ? "rotate(90deg) scale(.7)" : "none");
const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export class BoardAnimator {
  root: HTMLElement | null = null;
  private pending: { intents: Intent[]; rects: Rects; flipRest: boolean } | null = null;
  /** Count of animations started (debug / tests). */
  played = 0;

  /** Record the current layout for `intents`. Merges with a capture that hasn't been played yet. */
  capture(intents: Intent[], flipRest = false) {
    if (!this.root || reducedMotion()) { this.pending = null; return; }
    if (this.pending) {   // two updates before one render: the DOM still shows the first layout
      this.pending.intents.push(...intents);
      this.pending.flipRest ||= flipRest;
      return;
    }
    this.pending = { intents: [...intents], rects: this.measure(), flipRest };
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
    if (!p || !this.root || reducedMotion()) return;
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
          case "attack": this.attack(it.attacker, it.target, it.side, delay); break;
          case "pulse": this.pulse(it.uid, it.tone, delay); break;
        }
      } catch (e) { console.warn("animation", e); }
    }
    if (p.flipRest) this.flipRest(p.rects, flipped);
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
    const g = document.createElement("div");
    g.className = "duel-card duel-ghost";
    const w = from.width || to.width, h = from.height || to.height;
    Object.assign(g.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${w}px`, height: `${h}px` });
    const inner = document.createElement("div");
    inner.className = "duel-card-inner";
    if (faceUp && code > 0) {
      const face = document.createElement("div");
      face.className = "duel-card-face";
      const img = document.createElement("img");
      img.src = cardImage(code, "small");
      img.alt = "";
      face.appendChild(img);
      inner.appendChild(face);
    } else {
      const back = document.createElement("div");
      back.className = "duel-card-back";
      back.appendChild(document.createElement("span"));
      inner.appendChild(back);
    }
    g.appendChild(inner);
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
  attack(attackerUid: string, targetUid: string | null, side: 0 | 1, delay = 0) {
    if (!this.root || reducedMotion()) return;
    const a = this.el(attackerUid);
    if (!a) return;
    const t = targetUid ? this.el(targetUid) : this.zoneEl(`hand:${side}:`);
    const ar = a.getBoundingClientRect();
    const tr = t?.getBoundingClientRect();
    if (!tr) return;
    const p = center(ar), q = center(tr);
    const dx = (q.x - p.x) * 0.72, dy = (q.y - p.y) * (targetUid ? 0.72 : 0.5);
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

  private pulse(uid: string, tone: "activate" | "summon" | "target", delay: number) {
    const el = this.el(uid);
    if (!el) return;
    const color = tone === "target" ? "var(--danger)" : tone === "summon" ? "var(--ok)" : "var(--accent)";
    this.run(el, [
      { boxShadow: `0 0 0 0 ${color}` },
      { offset: 0.4, boxShadow: `0 0 0 5px ${color}` },
      { boxShadow: "0 0 0 10px transparent" },
    ], { duration: PULSE_MS, delay: delay + (tone === "summon" ? MOVE_MS - 60 : 0), easing: "ease-out" });
  }
}
