import { getCard } from "./useDuel.ts";
import { useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { BoardState, CardInstance, Zone } from "../../../shared/duel.ts";
import type { Seat } from "../../../shared/duelActions.ts";
import { zoneKey as zoneKeyOf } from "../engine/boardRefs.ts";
import { CardBack, CardView, type CardMark } from "./CardView.tsx";
import { Ambience } from "./anim/Ambience.tsx";

export interface ZoneRef { zone: Zone; player: Seat; slot?: number }

/** Engine-mode highlights (see components/engine/EngineBoard.tsx). Keys are card uids / zoneKeys. */
export interface BoardMarks {
  actionable: Set<string>;     // cards with at least one legal action
  selectable: Set<string>;     // cards a selection prompt lets you pick
  picked: Set<string>;         // cards already picked
  places: Set<string>;         // zones a select-place prompt offers
  piles: Map<string, number>;  // pile zoneKey -> how many of its cards are actionable / selectable
  badges: Map<string, string>; // uid -> small badge text (chain link, counters to remove)
}


function markOf(ui: BoardUI, uid: string): CardMark | undefined {
  const m = ui.marks;
  if (!m) return undefined;
  return m.picked.has(uid) ? "picked" : m.selectable.has(uid) ? "selectable" : m.actionable.has(uid) ? "actionable" : undefined;
}

/** What happens if the chosen attacker attacks this card (shown on targets while picking one). */
export interface Matchup { text: string; tone: "good" | "bad" | "even" | "unknown" }

export interface BoardUI {
  /** Attack outcome previews, by target uid, while you pick an attack target. */
  matchup?: Map<string, Matchup>;
  /** Hide the ATK / DEF strips (duel settings). */
  hideStats?: boolean;
  /** Your own display order of your hand (uids), after a local Shuffle hand. Cards not listed keep their order at the end. */
  handOrder?: string[] | null;
  /** Bottom side of the board (your seat; seat 0 for spectators). */
  me: Seat;
  /** Your real seat, null when spectating. */
  you: Seat | null;
  pending: boolean;
  flash: Set<string>;
  selectedUid: string | null;
  onCard(card: CardInstance, at: ZoneRef, e: MouseEvent): void;
  onZone(at: ZoneRef, e: MouseEvent): void;
  onHover(code: number | null): void;
  onDrop(at: ZoneRef, uid: string, e: DragEvent): void;
  onLp(player: Seat, e: MouseEvent): void;
  /** Rules-enforced mode: highlights, and only actionable hand cards can be dragged. */
  marks?: BoardMarks;
}

/** Can the viewer drag this card? (manual: any card you control; engine: hand cards with a legal action) */
const canDrag = (ui: BoardUI, card: CardInstance, controller: Seat | undefined, zone: Zone) =>
  ui.you !== null && controller === ui.you && (!ui.marks || (zone === "hand" && ui.marks.actionable.has(card.uid)));

export const DRAG_MIME = "application/x-ygo-uid";

function dragStart(card: CardInstance) {
  return (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, card.uid);
    e.dataTransfer.setData("text/plain", card.uid);
    e.dataTransfer.effectAllowed = "move";
  };
}

function DropZone({ at, ui, className, label, children, onClick }: { at: ZoneRef; ui: BoardUI; className: string; label?: string; children?: ReactNode; onClick?: (e: MouseEvent) => void }) {
  const [over, setOver] = useState(false);
  const canDrop = ui.you !== null;
  const key = zoneKeyOf(at);
  const place = ui.marks?.places.has(key);
  const oppSide = at.zone !== "extraMonster" && at.player !== ui.me;
  const pick = ui.marks?.piles.get(key);
  return (
    <div
      className={`duel-zone ${className} ${over ? "is-over" : ""} ${ui.pending || place ? "is-targetable" : ""} ${place ? "is-place" : ""} ${pick ? "is-pick" : ""} ${oppSide ? "is-opp-side" : ""}`}
      data-zone={at.zone}
      data-player={at.player}
      data-slot={at.slot}
      onClick={onClick ?? ((e) => ui.onZone(at, e))}
      onDragOver={canDrop ? (e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setOver(true); } } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={canDrop ? (e) => {
        e.preventDefault();
        setOver(false);
        const uid = e.dataTransfer.getData(DRAG_MIME);
        if (uid) ui.onDrop(at, uid, e);
      } : undefined}
    >
      {label && <span className="duel-zone-label">{label}</span>}
      {children}
      {!!pick && <span className="duel-pick-count" title={`${pick} card${pick === 1 ? "" : "s"} you can use here`}>{pick}</span>}
    </div>
  );
}

function Slot({ card, at, ui, label, className = "" }: { card: CardInstance | null; at: ZoneRef; ui: BoardUI; label: string; className?: string }) {
  const controller = at.zone === "extraMonster" ? (card?.controller ?? card?.owner) : at.player;
  return (
    <DropZone at={at} ui={ui} className={`duel-slot ${className} ${at.zone === "extraMonster" && card && controller !== ui.me ? "is-opp-side" : ""}`} label={card ? undefined : label}>
      {card && (
        <CardView
          // engine cards are named by zone: a different card landing here gets a fresh element (and animates as new)
          key={`${card.uid}:${card.code}`}
          card={card}
          draggable={canDrag(ui, card, controller, at.zone)}
          onDragStart={dragStart(card)}
          selected={ui.selectedUid === card.uid}
          flash={ui.flash.has(card.uid)}
          mark={markOf(ui, card.uid)}
          badge={ui.marks?.badges.get(card.uid)}
          onHover={ui.onHover}
          onClick={(e) => { e.stopPropagation(); ui.onCard(card, at, e); }}
        />
      )}
      {card && !ui.hideStats && (at.zone === "monster" || at.zone === "extraMonster") && <StatStrip card={card} />}
      {card && ui.matchup?.get(card.uid) && <span className={`duel-matchup is-${ui.matchup.get(card.uid)!.tone}`}>{ui.matchup.get(card.uid)!.text}</span>}
    </DropZone>
  );
}

/** ATK / DEF under a face-up monster: the stat it battles with is bold; boosted green, lowered red. */
function StatStrip({ card }: { card: CardInstance }) {
  const data = card.code > 0 && card.faceUp ? getCard(card.code) : null;
  if (!data || !/Monster/.test(data.type ?? "")) return null;
  const link = /Link/.test(data.type ?? "");
  const atk = card.atk ?? data.atk ?? 0, def = card.def ?? data.defense ?? 0;
  const tone = (now: number, base: number | null | undefined) => (base == null || now === base ? "" : now > base ? "is-up" : "is-down");
  const defPos = card.position === "def";
  return (
    <span className="duel-stats" aria-label={`ATK ${atk}${link ? "" : `, DEF ${def}`}`}>
      <b className={`${tone(atk, data.atk)} ${defPos ? "is-dim" : ""}`}>{atk}</b>
      {!link && <><i>/</i><b className={`${tone(def, data.defense)} ${defPos ? "" : "is-dim"}`}>{def}</b></>}
    </span>
  );
}

const PILE_LABEL: Record<string, string> = { deck: "Deck", extra: "Extra", gy: "GY", banished: "Banished" };

function Pile({ cards, at, ui }: { cards: CardInstance[]; at: ZoneRef; ui: BoardUI }) {
  const top = at.zone === "deck" ? cards[0] : cards[cards.length - 1];
  const showFace = top && (at.zone === "gy" || at.zone === "banished") && top.code !== 0;
  return (
    <DropZone at={at} ui={ui} className={`duel-pile duel-pile-${at.zone}`} label={cards.length ? undefined : PILE_LABEL[at.zone]}>
      {top && (showFace
        ? <CardView card={top} onHover={ui.onHover} draggable={!ui.marks && ui.you === at.player} onDragStart={dragStart(top)} badge={ui.marks?.badges.get(top.uid)} />
        : <div className="duel-card"><div className="duel-card-inner"><CardBack /></div></div>)}
      <span className="duel-pile-count" title={`${PILE_LABEL[at.zone]}: ${cards.length}`}>{cards.length}</span>
      <span className="duel-pile-name">{PILE_LABEL[at.zone]}</span>
    </DropZone>
  );
}

function Hand({ cards: inOrder, player, ui, own }: { cards: CardInstance[]; player: Seat; ui: BoardUI; own: boolean }) {
  // a local shuffle only changes how your hand is laid out; clicks still report the card's real slot
  const order = own && ui.handOrder ? ui.handOrder : null;
  const real = new Map(inOrder.map((c, i) => [c.uid, i]));
  const rank = (uid: string) => { const k = order ? order.indexOf(uid) : -1; return k < 0 ? 1e6 + (real.get(uid) ?? 0) : k; };
  const cards = order ? [...inOrder].sort((a, b) => rank(a.uid) - rank(b.uid)) : inOrder;
  return (
    <DropZone at={{ zone: "hand", player }} ui={ui} className={`duel-hand ${own ? "is-own" : "is-opp"}`} onClick={() => undefined}>
      <div className="duel-hand-fan" style={{ ["--n" as string]: Math.max(cards.length, 1) }}>
        {cards.map((c, i) => {
          const mark = markOf(ui, c.uid);
          return (
            <CardView
              key={c.uid}
              card={own ? { ...c, faceUp: true } : c}
              draggable={own && canDrag(ui, c, player, "hand")}
              onDragStart={dragStart(c)}
              selected={ui.selectedUid === c.uid}
              mark={mark}
              badge={ui.marks?.badges.get(c.uid)}
              style={{ ["--i" as string]: i - (cards.length - 1) / 2 }}
              onHover={ui.onHover}
              onClick={own || mark ? (e) => { e.stopPropagation(); ui.onCard(c, { zone: "hand", player, slot: real.get(c.uid) ?? i }, e); } : undefined}
            />
          );
        })}
        {!cards.length && <span className="duel-zone-label">{own ? "Your hand is empty" : "Empty hand"}</span>}
      </div>
    </DropZone>
  );
}

/** Both fields: opponent mirrored at the top, the 2 shared Extra Monster Zones in the middle. */
export function Board({ board, ui, top, bottom, rail, status, corner }: {
  board: BoardState; ui: BoardUI;
  /** Drawn on the board itself: player info in the opponent's (top) and your (bottom) hand strips, the phase
   *  track between the Extra Monster Zones, whose-move status left of it, Next phase right of it, and the
   *  tools + End turn in your corner (bottom right). Kept apart so nothing is a misclick away from End turn.
   *  On PC: player info in the left corners, the phase rail (track + Next phase) between them, the whose-move
   *  status right of the field, tools + End turn in your bottom-right corner. */
  top?: ReactNode; bottom?: ReactNode; rail?: ReactNode; status?: ReactNode; corner?: ReactNode;
}) {
  const me = ui.me;
  const opp: Seat = me === 0 ? 1 : 0;
  const P = board.players;
  const idx = [0, 1, 2, 3, 4];
  const emzLeft = me === 0 ? 0 : 1;
  const emzRight = 1 - emzLeft;
  const slot = (p: Seat, zone: "monster" | "spelltrap", i: number, label: string) =>
    <Slot key={`${p}${zone}${i}`} card={P[p][zone][i]} at={{ zone, player: p, slot: i }} ui={ui} label={label} />;

  return (
    <div className="duel-board-wrap">
      <Ambience />
      <Hand cards={P[opp].hand} player={opp} ui={ui} own={ui.you === opp} />
      <div className="duel-field">
        {top && <div className="duel-plate duel-plate-top">{top}</div>}
        {/* opponent: S/T row then monster row, mirrored */}
        <Pile cards={P[opp].deck} at={{ zone: "deck", player: opp }} ui={ui} />
        {[...idx].reverse().map((i) => slot(opp, "spelltrap", i, "S/T"))}
        <Pile cards={P[opp].extra} at={{ zone: "extra", player: opp }} ui={ui} />

        <Pile cards={P[opp].gy} at={{ zone: "gy", player: opp }} ui={ui} />
        {[...idx].reverse().map((i) => slot(opp, "monster", i, "Monster"))}
        <Slot card={P[opp].field} at={{ zone: "field", player: opp }} ui={ui} label="Field" className="duel-fieldzone" />

        <Pile cards={P[opp].banished} at={{ zone: "banished", player: opp }} ui={ui} />
        <div className="duel-gap" />
        <Slot card={board.extraMonster[emzLeft]} at={{ zone: "extraMonster", player: me, slot: emzLeft }} ui={ui} label="Extra Monster" className="duel-emz" />
        <div className="duel-gap" />
        <Slot card={board.extraMonster[emzRight]} at={{ zone: "extraMonster", player: me, slot: emzRight }} ui={ui} label="Extra Monster" className="duel-emz" />
        <div className="duel-gap" />
        <Pile cards={P[me].banished} at={{ zone: "banished", player: me }} ui={ui} />

        <Slot card={P[me].field} at={{ zone: "field", player: me }} ui={ui} label="Field" className="duel-fieldzone" />
        {idx.map((i) => slot(me, "monster", i, "Monster"))}
        <Pile cards={P[me].gy} at={{ zone: "gy", player: me }} ui={ui} />

        <Pile cards={P[me].extra} at={{ zone: "extra", player: me }} ui={ui} />
        {idx.map((i) => slot(me, "spelltrap", i, "S/T"))}
        <Pile cards={P[me].deck} at={{ zone: "deck", player: me }} ui={ui} />
        {bottom && <div className="duel-plate duel-plate-bottom">{bottom}</div>}
        {rail && <div className="duel-rail">{rail}</div>}
        {status && <div className="duel-status">{status}</div>}
        {corner && <div className="duel-corner">{corner}</div>}
      </div>
      <Hand cards={P[me].hand} player={me} ui={ui} own={ui.you === me} />
    </div>
  );
}

/** Pendulum Zones are only filled by engine-mode boards (manual mode uses S/T zones 1 and 5, Master Rule 5). */
export function PendulumStrip({ board, player, ui }: { board: BoardState; player: Seat; ui: BoardUI }) {
  const cards = board.players[player].pendulum;
  if (!cards.some(Boolean)) return null;
  return (
    <div className="duel-pendulum">
      {cards.map((c, i) => <Slot key={i} card={c} at={{ zone: "pendulum", player, slot: i }} ui={ui} label={i ? "P-R" : "P-L"} />)}
    </div>
  );
}
