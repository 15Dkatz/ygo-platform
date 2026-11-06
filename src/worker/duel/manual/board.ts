// Board helpers for manual mode: find / remove / place cards, setup, shuffling.
// Pure (no Cloudflare imports) so the reducer can be unit-tested with vitest.

import type { BoardState, CardInstance, PlayerBoard, Position, Zone } from "../../../shared/duel.ts";
import { STARTING_HAND, STARTING_LP, type PileZone, type Seat } from "../../../shared/duelActions.ts";

export interface Rng {
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Fresh unguessable id for a card instance. */
  uid(): string;
}

/** crypto-random RNG used by the Durable Object. */
export const cryptoRng: Rng = {
  int(n) {
    if (n <= 1) return 0;
    // rejection sampling to avoid modulo bias
    const limit = Math.floor(0xffffffff / n) * n;
    const buf = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) return buf[0] % n;
    }
  },
  uid() {
    const b = new Uint8Array(9);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_");
  },
};

export function shuffleInPlace<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Where a card currently is. */
export type Loc =
  | { kind: "pile"; player: Seat; zone: PileZone; index: number }
  | { kind: "slot"; player: Seat; zone: "monster" | "spelltrap" | "pendulum"; index: number }
  | { kind: "field"; player: Seat }
  | { kind: "emz"; index: number }
  | { kind: "material"; hostUid: string; index: number };

export interface Found { card: CardInstance; loc: Loc }

export const SLOT_COUNT = { monster: 5, spelltrap: 5, pendulum: 2, extraMonster: 2 } as const;

export function emptyPlayer(name: string): PlayerBoard {
  return {
    name, lp: STARTING_LP, deck: [], hand: [], extra: [], gy: [], banished: [],
    monster: [null, null, null, null, null], spelltrap: [null, null, null, null, null], field: null, pendulum: [null, null],
  };
}

export interface DeckList { main: number[]; extra: number[] }

/** New board: decks shuffled, 5 cards drawn each, 8000 LP, turn 1 for `first`. */
export function createBoard(names: [string, string], decks: [DeckList, DeckList], first: Seat, rng: Rng, startingLP = STARTING_LP): BoardState {
  const players = [emptyPlayer(names[0]), emptyPlayer(names[1])] as [PlayerBoard, PlayerBoard];
  for (const pl of players) pl.lp = startingLP;
  for (const p of [0, 1] as Seat[]) {
    const pb = players[p];
    pb.deck = shuffleInPlace(decks[p].main.map((code) => ({ uid: rng.uid(), code, owner: p, faceUp: false })), rng);
    pb.extra = decks[p].extra.map((code) => ({ uid: rng.uid(), code, owner: p, faceUp: false, extraDeck: true }));
    pb.hand = pb.deck.splice(0, STARTING_HAND);
  }
  return {
    players, extraMonster: [null, null], turn: 1, turnPlayer: first, phase: "draw",
    log: [`Duel start! ${names[first]} goes first. Both players draw ${STARTING_HAND} cards.`],
  };
}

function scan(card: CardInstance, loc: Loc, uid: string): Found | null {
  if (card.uid === uid) return { card, loc };
  for (let i = 0; i < (card.materials?.length ?? 0); i++) {
    const m = card.materials![i];
    if (m.uid === uid) return { card: m, loc: { kind: "material", hostUid: card.uid, index: i } };
  }
  return null;
}

export function findCard(b: BoardState, uid: string): Found | null {
  for (const p of [0, 1] as Seat[]) {
    const pb = b.players[p];
    for (const zone of ["hand", "deck", "extra", "gy", "banished"] as PileZone[]) {
      const i = pb[zone].findIndex((c) => c.uid === uid);
      if (i >= 0) return { card: pb[zone][i], loc: { kind: "pile", player: p, zone, index: i } };
    }
    for (const zone of ["monster", "spelltrap", "pendulum"] as const) {
      for (let i = 0; i < pb[zone].length; i++) {
        const c = pb[zone][i];
        const f = c && scan(c, { kind: "slot", player: p, zone, index: i }, uid);
        if (f) return f;
      }
    }
    const f = pb.field && scan(pb.field, { kind: "field", player: p }, uid);
    if (f) return f;
  }
  for (let i = 0; i < b.extraMonster.length; i++) {
    const c = b.extraMonster[i];
    const f = c && scan(c, { kind: "emz", index: i }, uid);
    if (f) return f;
  }
  return null;
}

export function zoneOf(loc: Loc): Zone | "material" {
  switch (loc.kind) {
    case "pile": case "slot": return loc.zone;
    case "field": return "field";
    case "emz": return "extraMonster";
    case "material": return "material";
  }
}

export const isOnField = (loc: Loc) => loc.kind === "slot" || loc.kind === "field" || loc.kind === "emz";

/** Which player controls the card at `loc`. */
export function controllerOf(b: BoardState, loc: Loc): Seat {
  switch (loc.kind) {
    case "pile": case "slot": case "field": return loc.player;
    case "emz": { const c = b.extraMonster[loc.index]!; return c.controller ?? c.owner; }
    case "material": { const host = findCard(b, loc.hostUid)!; return controllerOf(b, host.loc); }
  }
}

/** Is the card at `loc` visible to both players? */
export function isPublic(card: CardInstance, loc: Loc | { kind: "pile"; zone: PileZone } | { kind: "zone"; zone: Zone }): boolean {
  const zone = "zone" in loc ? loc.zone : zoneOf(loc as Loc);
  if (zone === "gy") return true;
  if (zone === "deck" || zone === "hand") return false;
  return card.faceUp;
}

export function removeAt(b: BoardState, loc: Loc): CardInstance {
  switch (loc.kind) {
    case "pile": return b.players[loc.player][loc.zone].splice(loc.index, 1)[0];
    case "slot": { const arr = b.players[loc.player][loc.zone]; const c = arr[loc.index]!; arr[loc.index] = null; return c; }
    case "field": { const c = b.players[loc.player].field!; b.players[loc.player].field = null; return c; }
    case "emz": { const c = b.extraMonster[loc.index]!; b.extraMonster[loc.index] = null; return c; }
    case "material": { const host = findCard(b, loc.hostUid)!.card; return host.materials!.splice(loc.index, 1)[0]; }
  }
}

/** Read the slot array for a field zone (pendulum/monster/spelltrap of a player, or the shared EMZ). */
export function slotArray(b: BoardState, zone: "monster" | "spelltrap" | "pendulum" | "extraMonster", player: Seat): (CardInstance | null)[] {
  return zone === "extraMonster" ? b.extraMonster : b.players[player][zone];
}

/** Normalise faceUp/position for the zone a card lands in. */
export function settle(card: CardInstance, zone: Zone, faceUp: boolean | undefined, position: Position | undefined): void {
  switch (zone) {
    case "monster": case "extraMonster": {
      let pos: Position;
      if (position) pos = position === "faceDown" ? "faceDownDef" : position;
      else if (faceUp === false) pos = "faceDownDef";
      else if (faceUp === true) pos = card.position === "def" ? "def" : "atk";
      else pos = card.position === "def" || card.position === "faceDownDef" ? card.position : "atk";
      card.position = pos;
      card.faceUp = pos !== "faceDownDef";
      break;
    }
    case "spelltrap": case "field": case "pendulum": {
      const up = position ? position !== "faceDown" && position !== "faceDownDef" : faceUp ?? card.position !== "faceDown";
      card.faceUp = zone === "pendulum" ? true : up;
      card.position = card.faceUp ? undefined : "faceDown";
      if (card.position === undefined) delete card.position;
      break;
    }
    case "deck": case "hand":
      card.faceUp = false; delete card.position; break;
    case "gy":
      card.faceUp = true; delete card.position; break;
    case "banished": case "extra":
      card.faceUp = faceUp ?? (zone === "banished"); delete card.position; break;
  }
  if (zone !== "extraMonster") delete card.controller;
  if (zone !== "monster" && zone !== "extraMonster" && zone !== "spelltrap" && zone !== "field" && zone !== "pendulum") {
    delete card.counters;
  }
}

export function firstFree(arr: (CardInstance | null)[]): number {
  return arr.findIndex((c) => c === null);
}

export function allCards(b: BoardState): CardInstance[] {
  const out: CardInstance[] = [];
  const push = (c: CardInstance | null) => { if (c) { out.push(c); c.materials?.forEach((m) => out.push(m)); } };
  for (const pb of b.players) {
    [...pb.deck, ...pb.hand, ...pb.extra, ...pb.gy, ...pb.banished, ...pb.monster, ...pb.spelltrap, ...pb.pendulum, pb.field].forEach(push);
  }
  b.extraMonster.forEach(push);
  return out;
}
