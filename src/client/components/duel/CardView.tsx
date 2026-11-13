import type React from "react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { cardImage } from "../../api.ts";
import { HIDDEN_CODE, type CardInstance } from "../../../shared/duel.ts";
import { getCard } from "./useDuel.ts";
import { CARD_BACK_SVG } from "./cardBack.ts";
import { RarityFoil, useRarity } from "../cards/Rarity.tsx";

/** The original card back (CSS layers + inline SVG emblem, see cardBack.ts). */
export function CardBack({ className = "" }: { className?: string }) {
  return <div className={`duel-card-back ${className}`} aria-label="Face-down card" dangerouslySetInnerHTML={{ __html: CARD_BACK_SVG }} />;
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

/** Engine-mode highlight: has a legal action / can be picked now / already picked. */
export type CardMark = "actionable" | "selectable" | "picked";

interface Props {
  card: CardInstance;
  mark?: CardMark;
  /** Small corner badge (chain link number, counters to remove). */
  badge?: string;
  draggable?: boolean;
  selected?: boolean;
  flash?: boolean;
  onClick?: (e: MouseEvent) => void;
  onHover?: (code: number | null) => void;
  onDragStart?: (e: DragEvent) => void;
  showCounters?: boolean;
  style?: CSSProperties;
  /** Hover action buttons (rules-enforced duels): play the card straight from hover. */
  quick?: { label: string; run(): void }[];
  /** The card whose effect you're deciding for: a pulsing ring, click to go back to the decision. */
  source?: boolean;
}

// Touch: holding a card for a moment inspects it (big preview) instead of opening its menu.
const LONG_PRESS_MS = 450;
let pressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressAt = 0;
const justLongPressed = () => Date.now() - longPressAt < 800;
function startPress(e: React.PointerEvent, code: number) {
  if (e.pointerType !== "touch" || code <= 0) return;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    longPressAt = Date.now();
    dispatchEvent(new CustomEvent("duel-inspect", { detail: code }));
  }, LONG_PRESS_MS);
}
const endPress = () => clearTimeout(pressTimer);

/** One card on the board / in a hand / in a viewer. Rotated for DEF, translucent when you can see your own face-down card. */
export function CardView({ card, draggable, selected, flash, onClick, onHover, onDragStart, showCounters = true, mark, badge, style, quick, source }: Props) {
  const known = card.code !== HIDDEN_CODE || card.token;
  const def = card.position === "def" || card.position === "faceDownDef";
  const ownFaceDown = !card.faceUp && known;
  const counters = card.counters ? Object.entries(card.counters) : [];
  const rarity = useRarity()(card.faceUp && known && !card.token ? card.code : 0, card.owner);
  const cls = ["duel-card", def ? "is-def" : "", ownFaceDown ? "is-own-facedown" : "", selected ? "is-selected" : "", flash ? "is-flash" : "", onClick ? "is-clickable" : "", mark ? `is-${mark}` : "", source ? "is-source" : ""].join(" ");
  return (
    <div
      className={cls}
      data-uid={card.uid}
      data-foil={rarity !== "common" ? rarity : undefined}
      style={style}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick ? (e) => { if (justLongPressed()) return; onClick(e); } : undefined}
      onContextMenu={(e) => { if (justLongPressed() || e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === "touch") { e.preventDefault(); return; } if (onClick) { e.preventDefault(); onClick(e); } }}
      onPointerDown={(e) => startPress(e, known ? card.code : 0)}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerMove={(e) => { if (e.pointerType === "touch" && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) endPress(); }}
      onMouseEnter={() => onHover?.(known ? card.code : null)}
      onMouseLeave={() => onHover?.(null)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e as unknown as MouseEvent); } } : undefined}
    >
      <div className="duel-card-inner">
        {known && (card.faceUp || ownFaceDown) ? <CardFace code={card.code} token={card.token} /> : <CardBack />}
        {ownFaceDown && <span className="duel-badge duel-badge-fd" title="Face-down (only you can see it)">set</span>}
        <RarityFoil rarity={rarity} type={getCard(card.code)?.type} code={card.code} />
      </div>
      {!!card.materials?.length && <span className="duel-badge duel-badge-mat" title="Xyz materials">{card.materials.length}</span>}
      {source && <span className="duel-srcfx" aria-hidden="true"><i className="sf1" /><i className="sf2" /><i className="sf3" /><i className="sf4" /></span>}
      {source && <span className="duel-source-tag" aria-hidden="true">Resolving</span>}
      {badge && <span className="duel-badge duel-badge-chain" title={/^\d+$/.test(badge) ? `Chain Link ${badge}` : badge}>{badge}</span>}
      {!!quick?.length && (
        <span className="duel-quick" role="group" aria-label="Actions">
          {quick.slice(0, 4).map((q, i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); q.run(); }} title={q.label}>{shortLabel(q.label)}</button>
          ))}
        </span>
      )}
      {showCounters && counters.length > 0 && (
        <span className="duel-badge duel-badge-ctr" title={counters.map(([k, v]) => `${k}: ${v}`).join(", ")}>
          {counters.reduce((s, [, v]) => s + v, 0)}
        </span>
      )}
    </div>
  );
}

/** Short button text for a card action ("Change to Defense Position" -> "To DEF"). */
function shortLabel(l: string): string {
  if (/^Change to Defense/.test(l)) return "To DEF";
  if (/^Change to Attack/.test(l)) return "To ATK";
  if (/^Attack \(can attack directly\)/.test(l)) return "Attack";
  if (l.length > 22) return `${l.slice(0, 20)}…`;
  return l;
}
