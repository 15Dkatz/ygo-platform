import { useState } from "react";
import type { Card } from "../../../shared/types.ts";
import { CardImage } from "../cards/CardImage.tsx";

function shuffled(ids: number[]): number[] {
  const a = [...ids];
  const r = new Uint32Array(a.length);
  crypto.getRandomValues(r);
  for (let i = a.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Draw a random opening hand from the Main Deck, then keep drawing, like the first turns of a duel. */
export function TestHand({ main, cardOf, onClose }: { main: number[]; cardOf: (id: number) => Card; onClose(): void }) {
  const [deck, setDeck] = useState(() => shuffled(main));
  const [drawn, setDrawn] = useState(5);
  const hand = deck.slice(0, drawn);
  const again = () => { setDeck(shuffled(main)); setDrawn(5); };

  return (
    <div className="th-backdrop" onClick={onClose}>
      <div className="th-dialog" role="dialog" aria-modal="true" aria-label="Test hand" onClick={(e) => e.stopPropagation()}>
        <div className="th-head">
          <h2>Test hand <span className="muted">({hand.length} drawn · {deck.length - hand.length} left in deck)</span></h2>
          <button type="button" className="th-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="th-hand">
          {hand.map((id, i) => (
            <div key={`${i}-${id}`} className="th-card" style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }} title={cardOf(id).name}>
              <CardImage card={cardOf(id)} />
            </div>
          ))}
        </div>
        <div className="th-actions">
          <button type="button" className="primary" onClick={again}>New hand</button>
          <button type="button" onClick={() => setDrawn((n) => Math.min(deck.length, n + 1))} disabled={drawn >= deck.length}>Draw 1</button>
          <span className="muted">Tip: press New hand a few times to see how often your deck opens well.</span>
        </div>
      </div>
    </div>
  );
}
