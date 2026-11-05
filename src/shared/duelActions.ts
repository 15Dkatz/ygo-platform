// Manual-mode board actions (phase 3). Sent by the client as `{ t: "action", action }`.
// The server does not enforce game rules: it only checks that a player moves cards they
// control, that destination zones are free, and it writes a log line for every action.

import type { BoardState, Position, Zone } from "./duel.ts";

export type Seat = 0 | 1;
export type Phase = BoardState["phase"];
export const PHASES: Phase[] = ["draw", "standby", "main1", "battle", "main2", "end"];
export const PHASE_LABEL: Record<Phase, string> = {
  draw: "Draw Phase", standby: "Standby Phase", main1: "Main Phase 1",
  battle: "Battle Phase", main2: "Main Phase 2", end: "End Phase",
};

export type PileZone = "deck" | "hand" | "extra" | "gy" | "banished";
export type SlotZone = "monster" | "spelltrap" | "pendulum" | "extraMonster";
export const PILE_ZONES: PileZone[] = ["deck", "hand", "extra", "gy", "banished"];
export const isPileZone = (z: Zone): z is PileZone => (PILE_ZONES as Zone[]).includes(z);

/** Where a card should go. */
export interface MoveDest {
  zone: Zone;
  /** Side of the board for field zones (defaults to the acting player). Piles always belong to the card's owner. */
  player?: Seat;
  /** Zone index for monster (0-4), spelltrap (0-4), pendulum (0-1), extraMonster (0-1). First free slot when omitted. */
  slot?: number;
  /** For zone "deck": top (default) or bottom. */
  deckPos?: "top" | "bottom";
  faceUp?: boolean;
  position?: Position;
}

export type DuelAction =
  | { type: "draw"; n?: number }
  | { type: "mill"; n?: number }                                // top N of your deck to the GY
  | { type: "banishTop"; n?: number; faceDown?: boolean }
  | { type: "shuffle" }                                         // shuffle your deck
  | { type: "move"; uid: string; to: MoveDest }                 // generic move between any zones
  | { type: "summon"; uid: string; zone?: "monster" | "extraMonster"; slot?: number; position?: "atk" | "def"; how?: "normal" | "special" | "tribute" }
  | { type: "activate"; uid: string; zone?: "spelltrap" | "field" | "pendulum"; slot?: number } // play face-up into a S/T / Field zone
  | { type: "set"; uid: string; zone: "monster" | "spelltrap" | "field"; slot?: number }
  | { type: "flip"; uid: string }                               // turn face-up <-> face-down (on the field / banished / extra)
  | { type: "position"; uid: string; position: Position }       // change battle position
  | { type: "attach"; uid: string; targetUid: string }          // make `uid` an Xyz material of `targetUid`
  | { type: "detach"; targetUid: string; materialUid: string; to?: MoveDest }   // default: owner's GY
  | { type: "counter"; uid: string; name?: string; delta: number }
  | { type: "lp"; player: Seat; delta?: number; set?: number }
  | { type: "reveal"; uid: string }                             // show one of your cards to everyone
  | { type: "revealHand" }
  | { type: "lookTop"; n: number }                              // private peek at your top N
  | { type: "viewDeck" }                                        // private look at your whole deck (searching)
  | { type: "attack"; uid: string; targetUid?: string | null }  // null/omitted = direct attack
  | { type: "phase"; phase: Phase }
  | { type: "endTurn" }
  | { type: "dice" }
  | { type: "coin" }
  | { type: "token"; code?: number; player?: Seat; slot?: number; position?: "atk" | "def" }
  | { type: "removeToken"; uid: string }
  | { type: "takeControl"; uid: string; slot?: number }         // opponent's monster -> your Monster Zone (logged)
  | { type: "concede" }
  | { type: "rematch" };                                        // handled by the room (same as ClientMsg rematch)

export type ActionType = DuelAction["type"];

/** Code for a generic token (never a real card id, and distinct from HIDDEN_CODE = 0). The client draws tokens itself. */
export const DEFAULT_TOKEN_CODE = -1;

export const STARTING_LP = 8000;
export const STARTING_HAND = 5;

export interface DeckLimits { mainMin: number; mainMax: number; extraMax: number; sideMax: number }
export const DECK_LIMITS: DeckLimits = { mainMin: 40, mainMax: 60, extraMax: 15, sideMax: 15 };

/** Validate a submitted deck. Returns an error message or null. */
export function validateDeck(d: { main?: unknown; extra?: unknown; side?: unknown }, limits = DECK_LIMITS): string | null {
  const ok = (a: unknown): a is number[] => Array.isArray(a) && a.every((x) => Number.isInteger(x) && (x as number) > 0 && (x as number) < 2 ** 31);
  if (!ok(d.main) || !ok(d.extra) || !ok(d.side ?? [])) return "Deck card ids must be positive integers.";
  if (d.main.length < limits.mainMin || d.main.length > limits.mainMax) return `Main Deck must have ${limits.mainMin}–${limits.mainMax} cards (has ${d.main.length}).`;
  if (d.extra.length > limits.extraMax) return `Extra Deck can have at most ${limits.extraMax} cards (has ${d.extra.length}).`;
  if (((d.side as number[] | undefined) ?? []).length > limits.sideMax) return `Side Deck can have at most ${limits.sideMax} cards.`;
  return null;
}
