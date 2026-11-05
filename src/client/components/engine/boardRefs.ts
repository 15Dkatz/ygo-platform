// Where an engine card / zone is drawn on the board.
//
// The engine addresses cards as EngineCardRef {controller, location, sequence, overlay}; the
// board it exports (EngineDuel.toBoardState) names every card by position:
//   uid = `e${seat}-${ocgLocation}-${coreSequence}`   (Xyz materials: `${hostUid}-m${i}`)
// where ocgLocation is the core's location bit (deck 1, hand 2, monster 4, S/T 8, GY 16,
// banished 32, Extra 64) and the sequence is the core's, *before* the deck is reversed for
// display. So a ref maps to its card by uid, whatever order the piles are drawn in.
//
// Zones (for select-place prompts and empty slots) need one more fact: the two Extra Monster
// Zones are shared, and the core numbers them 5/6 from each *team's* point of view (team 0 =
// the player who went first). `extraMonster[i]` on the board is i = team 0's seq 5 + i.

import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { EngineCardRef, EnginePlace, Seat } from "../../../shared/enginePrompts.ts";
import type { ZoneRef } from "../duel/Board.tsx";

const LOC = { deck: 1, hand: 2, monster: 4, spelltrap: 8, gy: 16, banished: 32, extra: 64 } as const;

/** Who took the first turn (the core's team 0), from the turn counter. */
export function engineFirst(board: Pick<BoardState, "turn" | "turnPlayer">): Seat {
  return (board.turn % 2 === 1 ? board.turnPlayer : 1 - board.turnPlayer) as Seat;
}

/** Master Rule 5 Pendulum Zones are S/T zones 0 and 4; the core may report them as PZONE 0/1 or SZONE 6/7. */
const pendulumSeq = (s: number) => (s === 0 || s === 6 ? 0 : 4);

/** The board uid of the card a ref points at (the Xyz monster's material for overlay refs). */
export function refUid(r: Pick<EngineCardRef, "controller" | "location" | "sequence" | "overlay">): string {
  const c = r.controller;
  switch (r.location) {
    case "overlay": return `e${c}-${LOC.monster}-${r.sequence}-m${r.overlay ?? 0}`;
    case "field": return `e${c}-${LOC.spelltrap}-5`;
    case "pendulum": return `e${c}-${LOC.spelltrap}-${pendulumSeq(r.sequence)}`;
    default: return `e${c}-${LOC[r.location]}-${r.sequence}`;
  }
}

/** The uid of the Xyz monster holding an overlay ref. */
export const overlayHostUid = (r: Pick<EngineCardRef, "controller" | "sequence">) => `e${r.controller}-${LOC.monster}-${r.sequence}`;

/** Index into `board.extraMonster` of a controller's EMZ sequence (5 or 6). */
export function emzIndex(controller: Seat, sequence: number, first: Seat): number {
  const team = controller ^ first;
  return team === 0 ? sequence - 5 : 6 - sequence;
}

/** The board zone of a select-place choice. */
export function placeZone(p: EnginePlace, first: Seat): ZoneRef {
  switch (p.location) {
    case "monster":
      return p.sequence >= 5 ? { zone: "extraMonster", player: p.controller, slot: emzIndex(p.controller, p.sequence, first) }
        : { zone: "monster", player: p.controller, slot: p.sequence };
    case "spelltrap": return { zone: "spelltrap", player: p.controller, slot: p.sequence };
    case "field": return { zone: "field", player: p.controller };
    case "pendulum": return { zone: "spelltrap", player: p.controller, slot: pendulumSeq(p.sequence) };
  }
}

/** The zone a ref's card sits in (field zones), or its pile. */
export function refZone(r: EngineCardRef, first: Seat): ZoneRef {
  switch (r.location) {
    case "monster": case "spelltrap": case "field": case "pendulum":
      return placeZone({ controller: r.controller, location: r.location, sequence: r.sequence }, first);
    case "overlay":
      return placeZone({ controller: r.controller, location: "monster", sequence: r.sequence }, first);
    default:
      return { zone: r.location, player: r.controller };
  }
}

/** A stable string for a zone (EMZ ignore the side: both players see the same two zones). */
export function zoneKey(z: ZoneRef): string {
  if (z.zone === "extraMonster") return `extraMonster:${z.slot ?? 0}`;
  return `${z.zone}:${z.player}:${z.slot ?? ""}`;
}

export interface Located { card: CardInstance; at: ZoneRef; host?: CardInstance }

/** Index every card on a board by uid (field cards, piles, Xyz materials). */
export function indexBoard(b: BoardState): Map<string, Located> {
  const out = new Map<string, Located>();
  const field = (c: CardInstance | null, at: ZoneRef) => {
    if (!c) return;
    out.set(c.uid, { card: c, at });
    c.materials?.forEach((m) => out.set(m.uid, { card: m, at, host: c }));
  };
  for (const p of [0, 1] as Seat[]) {
    const pb = b.players[p];
    for (const zone of ["hand", "deck", "extra", "gy", "banished"] as const) pb[zone].forEach((c, i) => out.set(c.uid, { card: c, at: { zone, player: p, slot: i } }));
    pb.monster.forEach((c, i) => field(c, { zone: "monster", player: p, slot: i }));
    pb.spelltrap.forEach((c, i) => field(c, { zone: "spelltrap", player: p, slot: i }));
    pb.pendulum.forEach((c, i) => field(c, { zone: "pendulum", player: p, slot: i }));
    field(pb.field, { zone: "field", player: p });
  }
  b.extraMonster.forEach((c, i) => field(c, { zone: "extraMonster", player: (c?.controller ?? c?.owner ?? 0) as Seat, slot: i }));
  return out;
}

/** Find the card a ref points at on a board (null if it isn't there, e.g. a stale ref). */
export function locateRef(b: BoardState, r: EngineCardRef, index = indexBoard(b)): Located | null {
  return index.get(refUid(r)) ?? null;
}

/** True for refs whose cards the board never draws one by one (piles and materials): pick them in a viewer. */
export const offBoard = (r: EngineCardRef) => r.location === "deck" || r.location === "extra" || r.location === "gy" || r.location === "banished" || r.location === "overlay";

/**
 * The code the viewer may see for a ref: prompts are sent unmasked to their player, so only
 * trust the prompt's code where the masked board would show the card anyway.
 */
export function visibleCode(r: EngineCardRef, viewer: Seat, board?: BoardState, index?: Map<string, Located>): number {
  if (r.controller === viewer) return r.code;
  switch (r.location) {
    case "gy": case "overlay": return r.code;
    case "banished": case "monster": case "spelltrap": case "field": case "pendulum": {
      const onBoard = board ? (index ?? indexBoard(board)).get(refUid(r))?.card : undefined;
      if (onBoard) return onBoard.code;
      return r.position === "faceDown" || r.position === "faceDownDef" ? 0 : r.location === "banished" ? 0 : r.code;
    }
    default: return 0;   // opponent's hand / deck / Extra Deck
  }
}
