// Per-viewer masking: hidden cards are sent with code HIDDEN_CODE (0).
//   deck            hidden from everyone (owner sees it only through a private "peek")
//   hand            visible to its owner
//   extra           visible to its owner; face-up (Pendulum) cards visible to all
//   gy              visible to all
//   banished        face-up visible to all, face-down to its owner
//   field zones     face-up visible to all, face-down to the controller
//   Xyz materials   like the card they are attached to (face-up materials are public)
// Spectators (viewer null) see only public information.

import type { BoardState, CardInstance, PlayerBoard } from "../../../shared/duel.ts";
import { HIDDEN_CODE } from "../../../shared/duel.ts";
import type { Seat } from "../../../shared/duelActions.ts";

function hide(c: CardInstance, keepMaterials: (m: CardInstance) => CardInstance): CardInstance {
  const out: CardInstance = { uid: c.uid, code: HIDDEN_CODE, owner: c.owner, faceUp: false };
  if (c.position) out.position = c.position;
  if (c.counters) out.counters = { ...c.counters };
  if (c.controller !== undefined) out.controller = c.controller;
  if (c.materials?.length) out.materials = c.materials.map(keepMaterials);
  return out;
}

function show(c: CardInstance, materials: (m: CardInstance) => CardInstance): CardInstance {
  const out = { ...c };
  if (c.counters) out.counters = { ...c.counters };
  if (c.materials) out.materials = c.materials.map(materials);
  return out;
}

export function maskBoard(b: BoardState, viewer: Seat | null): BoardState {
  const fieldCard = (controller: Seat) => {
    const f = (c: CardInstance | null): CardInstance | null => {
      if (!c) return null;
      const mat = (m: CardInstance) => (m.faceUp || viewer === controller ? show(m, mat) : hide(m, mat));
      return c.faceUp || viewer === controller ? show(c, mat) : hide(c, mat);
    };
    return f;
  };
  const pile = (cards: CardInstance[], visible: (c: CardInstance) => boolean) =>
    cards.map((c) => (visible(c) ? show(c, (m) => m) : hide(c, (m) => m)));

  const players = b.players.map((pb, i): PlayerBoard => {
    const p = i as Seat;
    const mine = viewer === p;
    const fc = fieldCard(p);
    return {
      name: pb.name,
      lp: pb.lp,
      deck: pile(pb.deck, () => false),
      hand: pile(pb.hand, () => mine),
      extra: pile(pb.extra, (c) => mine || c.faceUp),
      gy: pile(pb.gy, () => true),
      banished: pile(pb.banished, (c) => mine || c.faceUp),
      monster: pb.monster.map(fc),
      spelltrap: pb.spelltrap.map(fc),
      field: fc(pb.field),
      pendulum: pb.pendulum.map(fc),
    };
  }) as [PlayerBoard, PlayerBoard];

  const extraMonster = b.extraMonster.map((c) => (c ? fieldCard(c.controller ?? c.owner)(c) : null));
  // Never leak where a hidden card came from.
  const strip = (c: CardInstance | null) => {
    if (c && c.code === HIDDEN_CODE) delete c.extraDeck;
    c?.materials?.forEach(strip);
  };
  for (const pb of players) [...pb.deck, ...pb.hand, ...pb.extra, ...pb.gy, ...pb.banished, ...pb.monster, ...pb.spelltrap, ...pb.pendulum, pb.field].forEach(strip);
  extraMonster.forEach(strip);

  return { players, extraMonster, turn: b.turn, turnPlayer: b.turnPlayer, phase: b.phase, log: b.log };
}
