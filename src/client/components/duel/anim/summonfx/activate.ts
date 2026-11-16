// Activation effects (spell runes, trap snap, monster aura) and the chain line between links.
import type { Sfx } from "../sfx.ts";
import { TONE, bit, box, burst, circleSvg, ctr, sfx, shock, sq } from "./core.ts";
import type { ActivateKind, R, Run } from "./core.ts";

// ---------------------------------------------------------------------------------------
// activations

/** An activation's look on the card: spell runes, trap snap, monster aura. Returns its length (ms). */
export function activate(layer: HTMLElement, run: Run, r: R, kind: ActivateKind, delay: number, o: { card?: HTMLElement | null; tone?: string } = {}): number {
  const tone = o.tone ?? TONE[kind];
  const card = o.card ?? null;
  sfx(`act-${kind}` as Sfx, { inMs: delay });
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
  sfx("chain-link", { link, inMs: delay + (from ? 380 : 0) });
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
