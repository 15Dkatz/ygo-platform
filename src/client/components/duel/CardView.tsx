import type { DragEvent, MouseEvent } from "react";
import { cardImage } from "../../api.ts";
import { HIDDEN_CODE, type CardInstance } from "../../../shared/duel.ts";
import { getCard } from "./useDuel.ts";

/** Plain CSS card back (no artwork). */
export function CardBack({ className = "" }: { className?: string }) {
  return <div className={`duel-card-back ${className}`} aria-label="Face-down card"><span /></div>;
}

export function CardFace({ code, token, size = "small" }: { code: number; token?: boolean; size?: "small" | "full" }) {
  if (token && code <= 0) return <div className="duel-token-face"><b>TOKEN</b></div>;
  if (code === HIDDEN_CODE) return <CardBack />;
  const card = getCard(code);
  return (
    <div className="duel-card-face">
      <img src={cardImage(code, size)} alt={card?.name ?? `Card ${code}`} loading="lazy" draggable={false}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
      <span className="duel-card-fallback">{card?.name ?? code}</span>
    </div>
  );
}

interface Props {
  card: CardInstance;
  draggable?: boolean;
  selected?: boolean;
  flash?: boolean;
  onClick?: (e: MouseEvent) => void;
  onHover?: (code: number | null) => void;
  onDragStart?: (e: DragEvent) => void;
  showCounters?: boolean;
}

/** One card on the board / in a hand / in a viewer. Rotated for DEF, translucent when you can see your own face-down card. */
export function CardView({ card, draggable, selected, flash, onClick, onHover, onDragStart, showCounters = true }: Props) {
  const known = card.code !== HIDDEN_CODE || card.token;
  const def = card.position === "def" || card.position === "faceDownDef";
  const ownFaceDown = !card.faceUp && known;
  const counters = card.counters ? Object.entries(card.counters) : [];
  const cls = ["duel-card", def ? "is-def" : "", ownFaceDown ? "is-own-facedown" : "", selected ? "is-selected" : "", flash ? "is-flash" : "", onClick ? "is-clickable" : ""].join(" ");
  return (
    <div
      className={cls}
      data-uid={card.uid}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onClick ? (e) => { e.preventDefault(); onClick(e); } : undefined}
      onMouseEnter={() => onHover?.(known ? card.code : null)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e as unknown as MouseEvent); } } : undefined}
    >
      <div className="duel-card-inner">
        {known && (card.faceUp || ownFaceDown) ? <CardFace code={card.code} token={card.token} /> : <CardBack />}
        {ownFaceDown && <span className="duel-badge duel-badge-fd" title="Face-down (only you can see it)">set</span>}
      </div>
      {!!card.materials?.length && <span className="duel-badge duel-badge-mat" title="Xyz materials">{card.materials.length}</span>}
      {showCounters && counters.length > 0 && (
        <span className="duel-badge duel-badge-ctr" title={counters.map(([k, v]) => `${k}: ${v}`).join(", ")}>
          {counters.reduce((s, [, v]) => s + v, 0)}
        </span>
      )}
    </div>
  );
}
