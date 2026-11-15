// /dev/summons (unlinked): every summon and activation animation on a small mock field, one click each,
// to judge them by eye (the same functions the duel uses, anim/summonFx.ts).
import { useEffect, useRef, useState } from "react";
import { cardImage } from "../api.ts";
import { useCardData } from "../components/duel/useDuel.ts";
import {
  ACTIVATE_LABEL, SUMMON_LABEL, activate, chainLine, isBig, splash, summon, toneOf,
  type ActivateKind, type SummonKind,
} from "../components/duel/anim/summonFx.ts";
import { CardBack } from "../components/duel/CardView.tsx";
import { SPLASH_STYLES, SPLASH_STYLE_LABEL, type SplashStyle } from "../components/duel/duelSettings.ts";

const SUMMONS: { kind: SummonKind; code: number }[] = [
  { kind: "normal", code: 69247929 },     // Gene-Warped Warwolf
  { kind: "tribute", code: 46986420 },    // Dark Magician
  { kind: "set", code: 0 },
  { kind: "flip", code: 54652250 },       // Man-Eater Bug
  { kind: "special", code: 74677427 },    // Red-Eyes Black Dragon
  { kind: "ritual", code: 5405694 },      // Black Luster Soldier
  { kind: "fusion", code: 23995348 },     // Blue-Eyes Ultimate Dragon
  { kind: "synchro", code: 44508094 },    // Stardust Dragon
  { kind: "xyz", code: 84013237 },        // Number 39: Utopia
  { kind: "link", code: 86066372 },       // Accesscode Talker
  { kind: "pendulum", code: 16178683 },   // Odd-Eyes Pendulum Dragon
];
const ACTIVATIONS: { kind: ActivateKind; code: number }[] = [
  { kind: "spell", code: 55144522 },      // Pot of Greed
  { kind: "quick", code: 24224830 },      // Called by the Grave
  { kind: "trap", code: 44095762 },       // Mirror Force
  { kind: "counter", code: 41420027 },    // Solemn Judgment
  { kind: "monster", code: 14558127 },    // Ash Blossom
];
const CODES = [...SUMMONS, ...ACTIVATIONS].map((x) => x.code).filter(Boolean);

type Slot = { code: number; faceDown?: boolean } | null;

export default function SummonLab() {
  const card = useCardData(CODES);
  const stage = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [monsters, setMonsters] = useState<Slot[]>([null, null, null, null, null]);
  const [spells, setSpells] = useState<Slot[]>([null, null, null, null, null]);
  const [side, setSide] = useState<"left" | "right">("left");
  const [big, setBig] = useState<"auto" | "on" | "off">("auto");
  const [splashOn, setSplashOn] = useState(true);
  const [short, setShort] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  // run the effect once React has drawn the new card in its zone
  useEffect(() => { const f = pending.current; pending.current = null; if (f) requestAnimationFrame(f); });

  const run = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => el.animate(frames, { fill: "backwards", ...opts });
  const zone = (row: "m" | "s", i: number) => stage.current?.querySelector<HTMLElement>(`[data-z="${row}${i}"]`) ?? null;
  const mid = () => { const r = stage.current!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const [sumStyle, setSumStyle] = useState<SplashStyle>("showcase");
  const [actStyle, setActStyle] = useState<SplashStyle>("portal");

  const doSummon = (kind: SummonKind, code: number, at = 2) => {
    setMonsters((m) => m.map((x, i) => (i === at ? { code: code || 89631139, faceDown: kind === "set" } : x)));
    pending.current = () => {
      const z = zone("m", at);
      if (!z || !layer.current) return;
      const c = card(code);
      const heavy = big === "on" || (big === "auto" && isBig(c));
      const d = splashOn && kind !== "set" && code ? splash(layer.current, run, { code, name: c?.name ?? "", kicker: SUMMON_LABEL[kind], tone: toneOf(kind), at: z.getBoundingClientRect(), center: mid(), mine: side === "left", style: sumStyle, big: heavy, short }, 0) : 0;
      summon(layer.current, run, z.getBoundingClientRect(), kind, d, { card: z.querySelector<HTMLElement>(".lab-card"), stage: stage.current, big: heavy, markers: c?.linkmarkers });
    };
  };
  const doActivate = (kind: ActivateKind, code: number, at = 2, link = 1, prev: HTMLElement | null = null, delay = 0) => {
    const monster = kind === "monster";
    (monster ? setMonsters : setSpells)((m) => m.map((x, i) => (i === at ? { code } : x)));
    const go = () => {
      const z = zone(monster ? "m" : "s", at);
      if (!z || !layer.current) return;
      const c = card(code);
      const d = splashOn && !short ? splash(layer.current, run, { code, name: c?.name ?? "", kicker: link > 1 ? `Chain ${link} · ${ACTIVATE_LABEL[kind]}` : ACTIVATE_LABEL[kind], tone: toneOf(kind, c), at: z.getBoundingClientRect(), center: mid(), mine: side === "left", style: actStyle, short: link > 1 }, delay) : delay;
      activate(layer.current, run, z.getBoundingClientRect(), kind, d, { card: z.querySelector<HTMLElement>(".lab-card"), tone: toneOf(kind, c) });
      chainLine(layer.current, run, prev?.getBoundingClientRect() ?? null, z.getBoundingClientRect(), link, d);
    };
    pending.current = go;
  };
  const chain3 = () => {
    setSpells((s) => s.map((x, i) => (i === 0 ? { code: 55144522 } : i === 3 ? { code: 44095762 } : x)));
    setMonsters((m) => m.map((x, i) => (i === 1 ? { code: 14558127 } : x)));
    pending.current = () => {
      const L = layer.current!;
      const a = zone("s", 0)!, b = zone("m", 1)!, c = zone("s", 3)!;
      const steps: [HTMLElement, HTMLElement | null, ActivateKind, number][] = [[a, null, "spell", 55144522], [b, a, "monster", 14558127], [c, b, "trap", 44095762]];
      let t = 0;
      steps.forEach(([el, prev, kind, code], i) => {
        const cd = card(code);
        const d = splashOn ? splash(L, run, { code, name: cd?.name ?? "", kicker: i ? `Chain ${i + 1} · ${ACTIVATE_LABEL[kind]}` : ACTIVATE_LABEL[kind], tone: toneOf(kind, cd), at: el.getBoundingClientRect(), center: mid(), mine: (i % 2 ? side !== "left" : side === "left"), style: actStyle, short: i > 0 || short }, t) : t;
        activate(L, run, el.getBoundingClientRect(), kind, d, { card: el.querySelector<HTMLElement>(".lab-card"), tone: toneOf(kind, cd) });
        chainLine(L, run, prev?.getBoundingClientRect() ?? null, el.getBoundingClientRect(), i + 1, d);
        t = d + 500;
      });
    };
  };
  const reset = () => { setMonsters([null, null, null, null, null]); setSpells([null, null, null, null, null]); };

  const slot = (s: Slot, key: string) => (
    <div key={key} data-z={key} className="lab-zone">
      {s && (s.faceDown ? <div className="lab-card"><CardBack /></div> : <img className="lab-card" src={cardImage(s.code, "small")} alt={card(s.code)?.name ?? ""} />)}
    </div>
  );

  return (
    <section className="summon-lab">
      <h1>Summon &amp; activation lab</h1>
      <div className="lab-controls">
        <div><b>Summons</b>{SUMMONS.map((s) => <button key={s.kind} onClick={() => doSummon(s.kind, s.code)} style={{ ["--c" as string]: toneOf(s.kind) }}>{SUMMON_LABEL[s.kind]}</button>)}</div>
        <div><b>Activations</b>{ACTIVATIONS.map((a) => <button key={a.kind} onClick={() => doActivate(a.kind, a.code)} style={{ ["--c" as string]: toneOf(a.kind, card(a.code)) }}>{ACTIVATE_LABEL[a.kind]}</button>)}
          <button onClick={chain3}>Chain of 3</button></div>
        <div className="lab-opts">
          <label>Boss weight <select value={big} onChange={(e) => setBig(e.target.value as typeof big)}><option value="auto">Auto (Level 7+, 2500+ ATK)</option><option value="on">Always</option><option value="off">Never</option></select></label>
          <label><input type="checkbox" checked={splashOn} onChange={(e) => setSplashOn(e.target.checked)} /> Art splash</label>
          <label><input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} /> Short splash</label>
          <label>Whose <select value={side} onChange={(e) => setSide(e.target.value as "left" | "right")}><option value="left">Yours</option><option value="right">Opponent's</option></select></label>
          <label>Summons as <select value={sumStyle} onChange={(e) => setSumStyle(e.target.value as SplashStyle)}>{SPLASH_STYLES.map((x) => <option key={x} value={x}>{SPLASH_STYLE_LABEL[x]}</option>)}</select></label>
          <label>Activations as <select value={actStyle} onChange={(e) => setActStyle(e.target.value as SplashStyle)}>{SPLASH_STYLES.map((x) => <option key={x} value={x}>{SPLASH_STYLE_LABEL[x]}</option>)}</select></label>
          <button onClick={reset}>Clear field</button>
        </div>
      </div>
      <div className="lab-stage" ref={stage}>
        <div className="lab-row">{monsters.map((s, i) => slot(s, `m${i}`))}</div>
        <div className="lab-row">{spells.map((s, i) => slot(s, `s${i}`))}</div>
      </div>
      <div ref={layer} className="lab-layer" aria-hidden="true" />
      <style>{`
        .summon-lab { display: grid; gap: 14px; }
        .lab-controls { display: grid; gap: 8px; }
        .lab-controls > div { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .lab-controls b { width: 92px; font-size: 13px; color: var(--muted); }
        .lab-controls button[style] { border-color: var(--c); box-shadow: inset 0 -2px 0 var(--c); }
        .lab-opts { font-size: 13px; gap: 14px !important; }
        .lab-stage { position: relative; display: grid; gap: 22px; justify-content: center; padding: 70px 20px; border-radius: 16px;
          background: radial-gradient(120% 90% at 50% 40%, #1d1b3a, #07070f); border: 1px solid var(--border); perspective: 900px; }
        .lab-row { display: grid; grid-template-columns: repeat(5, 104px); gap: 18px; transform: rotateX(18deg); }
        .lab-zone { position: relative; aspect-ratio: 59 / 86; border-radius: 6px; border: 1px solid rgb(255 255 255 / .12); background: rgb(255 255 255 / .03); }
        .lab-card { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 5px; overflow: hidden; display: block; }
        .lab-layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 50; }
      `}</style>
    </section>
  );
}
