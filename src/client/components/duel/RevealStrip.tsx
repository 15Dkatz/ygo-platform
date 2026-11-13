// What was just shown face-up (excavated, revealed from a hand, looked at), for both players to follow:
// the cards stay up in a strip, and each one is tagged with where it goes next (Hand, GY, Deck...).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Seat } from "../../../shared/duelActions.ts";
import type { EngineEvent } from "../../../shared/enginePrompts.ts";
import { CardFace } from "./CardView.tsx";
import { getCard } from "./useDuel.ts";
import { play as sfx } from "./anim/sfx.ts";

interface Shown { code: number; controller: Seat; from: string; fate?: string }
export interface Reveal { key: number; title: string; cards: Shown[]; hidden: boolean }

const FATE: Record<string, string> = { hand: "→ Hand", gy: "→ GY", banished: "→ Banished", deck: "→ Deck", extra: "→ Extra", monster: "→ Summoned", spelltrap: "→ Field", field: "→ Field", pendulum: "→ Field", overlay: "→ Material" };

/** Feed it every batch of engine events; it keeps the current reveal (null when nothing is shown). */
export function useReveals(names: [string, string], you: Seat | null) {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const namesRef = useRef(names);
  namesRef.current = names;
  const onEvents = useCallback((events: EngineEvent[] | null) => {
    if (!events?.length) return;
    setReveal((cur) => {
      let r = cur;
      for (const e of events) {
        if (e.e === "confirm" && e.cards.length) {
          const owner = e.cards[0].controller, loc = e.cards[0].location;
          const hidden = e.cards.every((c) => c.code <= 0);
          const who = e.player === you ? "You" : namesRef.current[e.player];
          const whose = owner === e.player ? (e.player === you ? "your" : "their") : owner === you ? "your" : `${namesRef.current[owner]}'s`;
          const n = e.cards.length, cards = `${n} card${n === 1 ? "" : "s"}`;
          const title = hidden ? `${who} looked at ${cards} from ${whose} ${loc === "deck" ? "Deck" : loc}`
            : e.public && loc === "deck" ? `${who === "You" ? "You" : namesRef.current[owner]} excavated ${cards}`
            : loc === "hand" ? `Revealed from ${owner === you ? "your" : `${namesRef.current[owner]}'s`} hand`
            : loc === "extra" ? `Revealed from ${owner === you ? "your" : `${namesRef.current[owner]}'s`} Extra Deck`
            : e.player === you ? `You look at ${cards}` : `Revealed: ${cards}`;
          r = { key: Date.now() + Math.random(), title, hidden, cards: e.cards.map((c) => ({ code: c.code, controller: c.controller, from: c.location })) };
          sfx("draw");
        } else if (e.e === "move" && r && e.from) {
          // the shown card moves on: tag it with where it went (first untagged match)
          const i = r.cards.findIndex((c) => !c.fate && c.from === e.from!.location && c.controller === e.from!.controller && (c.code <= 0 || e.code <= 0 || c.code === e.code));
          if (i >= 0 && e.to?.location !== e.from.location) {
            const fate = e.to ? (e.from.location === "deck" && e.to.location === "deck" ? "→ Deck" : FATE[e.to.location] ?? "moved") : "moved";
            r = { ...r, cards: r.cards.map((c, j) => (j === i ? { ...c, fate } : c)) };
          }
        }
      }
      return r;
    });
  }, [you]);

  // linger: a while after the last change (longer while cards are still undecided)
  useEffect(() => {
    if (!reveal) return;
    const open = reveal.cards.some((c) => !c.fate);
    const t = setTimeout(() => setReveal(null), open ? 12_000 : 3_500);
    return () => clearTimeout(t);
  }, [reveal]);

  return { reveal, onEvents, dismiss: () => setReveal(null) };
}

export function RevealStrip({ reveal, onHover, onZoom, onClose }: { reveal: Reveal; onHover(code: number | null): void; onZoom(code: number): void; onClose(): void }) {
  return (
    <div key={reveal.key} className="duel-reveal" role="status" aria-live="polite">
      <div className="duel-reveal-head">
        <b>{reveal.title}</b>
        <button onClick={onClose} aria-label="Hide" title="Hide">✕</button>
      </div>
      <div className="duel-reveal-cards">
        {reveal.cards.map((c, i) => (
          <div key={i} className={`duel-reveal-card ${c.fate ? "has-fate" : ""}`} style={{ animationDelay: `${i * 110}ms` }}
            onMouseEnter={() => c.code > 0 && onHover(c.code)} onMouseLeave={() => onHover(null)} onClick={() => c.code > 0 && onZoom(c.code)}
            title={c.code > 0 ? getCard(c.code)?.name : "Hidden"}>
            <span className="duel-card"><span className="duel-card-inner"><CardFace code={c.code} /></span></span>
            {c.fate && <span className="duel-reveal-fate">{c.fate}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
