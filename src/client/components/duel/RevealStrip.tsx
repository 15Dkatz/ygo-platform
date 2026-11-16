// What was just shown face-up (excavated, revealed from a hand, looked at), for both players to follow:
// the cards stay up in a strip, and each one is tagged with where it goes next (Hand, GY, Deck...).
import { usePageFlag } from "./pageFlag.ts";
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

  // stable, so the strip's countdown doesn't restart on every page render
  const dismiss = useCallback(() => setReveal(null), []);
  return { reveal, onEvents, dismiss };
}

/** How long a reveal stays up when nobody points at it; pointing at it pauses (and then restarts) the countdown. */
export const REVEAL_MS = 8_000;

export function RevealStrip({ reveal, onHover, onZoom, onClose }: { reveal: Reveal; onHover(code: number | null): void; onZoom(code: number): void; onClose(): void }) {
  usePageFlag("reveal");
  const [held, setHeld] = useState(false);
  // the countdown restarts whenever the reveal changes (a card's destination arrives) or the pointer leaves
  const [round, setRound] = useState(0);
  const fates = reveal.cards.filter((c) => c.fate).length;
  useEffect(() => {
    if (held) return;
    const t = setTimeout(onClose, REVEAL_MS);
    return () => clearTimeout(t);
  }, [held, round, reveal.key, fates, onClose]);
  return (
    <div key={reveal.key} className={`duel-reveal ${held ? "is-held" : ""}`} role="status" aria-live="polite"
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => { setHeld(false); setRound((r) => r + 1); }}
      onFocus={() => setHeld(true)} onBlur={() => { setHeld(false); setRound((r) => r + 1); }}>
      <div className="duel-reveal-head">
        <b>{reveal.title}</b>
        <span className="duel-reveal-hint">{held ? "Paused" : ""}</span>
        <button onClick={onClose} aria-label="Hide" title="Hide">✕</button>
      </div>
      {/* time left before it closes by itself */}
      <span className="duel-reveal-timer" aria-hidden="true"><i key={`${reveal.key}-${fates}-${round}`} style={{ animationDuration: `${REVEAL_MS}ms` }} /></span>
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
