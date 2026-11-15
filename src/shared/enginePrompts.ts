// Rules-engine (phase 4) websocket payloads. These fill in the `unknown` slots of
// `ServerMsg { t: "prompt" }` / `ClientMsg { t: "respond" }` in duel.ts and add one new
// server message, `engineEvents`. Seats are room seats (0 = host side, 1 = guest),
// never the core's internal team numbers.

import type { BoardState, Position } from "./duel.ts";

export type Seat = 0 | 1;

export type EngineLocation =
  | "deck" | "hand" | "monster" | "spelltrap" | "gy" | "banished" | "extra" | "overlay" | "field" | "pendulum";

/** A card as the engine addresses it. `code` is 0 when hidden from the viewer. */
export interface EngineCardRef {
  code: number;
  controller: Seat;
  location: EngineLocation;
  sequence: number;           // zone index (monster 0-4 main, 5-6 extra monster zones)
  position?: Position;
  overlay?: number;           // index in the Xyz material stack, when location = "overlay"
}

/** A card that offers an effect; `desc` is the effect text resolved from the card's strings. */
/** A card that offers an effect; `desc` is the effect text resolved from the card's strings. `from` = the
 *  card the effect text belongs to, when it isn't this card: an effect granted by another card (JJ "Kewl
 *  Tune", an Xyz material, an Equip...), shown as "from X". */
export interface EngineEffectRef extends EngineCardRef { desc: string; from?: number }

/** A zone the player may pick in a select-place prompt. */
export interface EnginePlace { controller: Seat; location: "monster" | "spelltrap" | "field" | "pendulum"; sequence: number }

export type EnginePhase = BoardState["phase"];

interface PromptBase {
  /** Increments with every prompt; a response must echo it. */
  id: number;
  player: Seat;
  /** What the core says the choice is for ("Select a card to destroy", ...), when known. */
  hint?: string;
  /** The hint is the engine's generic wording (a system string), safe to show the other player; otherwise
   *  it may name a card (e.g. the card being Set face-down) and stays with the chooser. */
  hintIsPublic?: boolean;
}

export type EnginePrompt = PromptBase & (
  | {
      kind: "idle";              // Main Phase: what to do next
      summons: EngineCardRef[];
      specialSummons: EngineCardRef[];
      repositions: EngineCardRef[];
      monsterSets: EngineCardRef[];
      spellSets: EngineCardRef[];
      activates: EngineEffectRef[];
      canBattle: boolean;
      canEnd: boolean;
      canShuffle: boolean;
    }
  | {
      kind: "battle";            // Battle Phase
      activates: EngineEffectRef[];
      attacks: (EngineCardRef & { direct: boolean })[];
      canMain2: boolean;
      canEnd: boolean;
    }
  | { kind: "effectYesNo"; card: EngineCardRef; desc: string }
  | { kind: "yesNo"; desc: string }
  | { kind: "option"; options: string[] }
  | { kind: "selectCard"; min: number; max: number; canCancel: boolean; cards: EngineCardRef[] }
  | {
      kind: "selectUnselect";    // pick cards one at a time; `selected` can be toggled off
      min: number; max: number; canFinish: boolean; canCancel: boolean;
      cards: EngineCardRef[]; selected: EngineCardRef[];
    }
  | { kind: "selectChain"; forced: boolean; cards: EngineEffectRef[] }
  | { kind: "selectPlace"; count: number; places: EnginePlace[]; disabling: boolean }
  | { kind: "selectPosition"; code: number; positions: Position[] }   // "faceDown" = face-down Attack (rare)
  | { kind: "selectTribute"; min: number; max: number; canCancel: boolean; cards: (EngineCardRef & { value: number })[] }
  | { kind: "selectSum"; target: number; exact: boolean; min: number; max: number;
      must: (EngineCardRef & { value: number })[]; cards: (EngineCardRef & { value: number })[] }
  | { kind: "selectCounter"; counterType: number; count: number; cards: (EngineCardRef & { available: number })[] }
  | { kind: "sort"; chain: boolean; cards: EngineCardRef[] }
  | { kind: "rps" }
  | { kind: "announceNumber"; options: number[] }
  | { kind: "announceRace"; count: number; available: number[] }       // OCG race bit values
  | { kind: "announceAttribute"; count: number; available: number[] }  // OCG attribute bit values
  | { kind: "announceCard" }   // declare a card name: answer with its passcode
);

export type EnginePromptKind = EnginePrompt["kind"];

/** The answer to the prompt with the same `promptId`. */
export type EngineResponse = { promptId: number } & (
  | { kind: "idle"; action: "summon" | "specialSummon" | "reposition" | "monsterSet" | "spellSet" | "activate"; index: number }
  | { kind: "idle"; action: "battle" | "end" | "shuffle" }
  | { kind: "battle"; action: "activate" | "attack"; index: number }
  | { kind: "battle"; action: "main2" | "end" }
  | { kind: "effectYesNo" | "yesNo"; yes: boolean }
  | { kind: "option"; index: number }
  | { kind: "selectCard" | "selectTribute"; indices: number[] | null }   // null = cancel
  | { kind: "selectUnselect"; index: number | null }   // index into cards, or cards.length + i to unselect selected[i]; null = finish/cancel
  | { kind: "selectChain"; index: number | null }      // null = don't chain
  | { kind: "selectPlace"; places: EnginePlace[] }
  | { kind: "selectPosition"; position: Position }
  | { kind: "selectSum"; indices: number[] }           // indices into `cards` (the `must` cards are implied)
  | { kind: "selectCounter"; counts: number[] }
  | { kind: "sort"; order: number[] | null }
  | { kind: "rps"; choice: "rock" | "paper" | "scissors" }
  | { kind: "announceNumber"; index: number }
  | { kind: "announceRace" | "announceAttribute"; values: number[] }
  | { kind: "announceCard"; code: number }
);

/** A response without its `promptId` (distributes over the union, unlike `Omit`). */
export type EngineResponseBody = EngineResponse extends infer R ? R extends unknown ? Omit<R, "promptId"> : never : never;

/** Things that happened, for the log and animations. Hidden codes are already 0 for the viewer. */
export type EngineEvent =
  | { e: "start" }
  | { e: "turn"; player: Seat; turn: number }
  | { e: "phase"; phase: EnginePhase; step?: "start" | "battleStep" | "damage" | "damageCalc" }
  | { e: "draw"; player: Seat; codes: number[] }
  | { e: "move"; code: number; from: EngineCardRef | null; to: EngineCardRef | null }
  | { e: "summon"; how: "normal" | "special" | "flip"; card: EngineCardRef }
  | { e: "set"; card: EngineCardRef }
  | { e: "reposition"; card: EngineCardRef }
  | { e: "chain"; link: number; card: EngineCardRef; desc: string; from?: number }
  | { e: "chainSolving" | "chainSolved" | "chainNegated" | "chainDisabled"; link: number }
  | { e: "chainEnd" }
  | { e: "lp"; player: Seat; lp: number; delta: number; cause: "damage" | "recover" | "cost" | "set" }
  | { e: "attack"; attacker: EngineCardRef; target: EngineCardRef | null }
  | { e: "battle"; attacker: EngineCardRef; target: EngineCardRef | null }
  | { e: "coin"; player: Seat; results: boolean[] }   // true = heads
  | { e: "dice"; player: Seat; results: number[] }
  | { e: "rps"; results: [number, number] }            // 1 scissors, 2 rock, 3 paper
  /** Cards shown face-up. `public`: both players see them (excavating, revealing from the hand / field);
   *  otherwise only `player` does (looking at your own Deck): the other player gets the count, codes hidden. */
  | { e: "confirm"; player: Seat; cards: EngineCardRef[]; public?: boolean }
  | { e: "shuffle"; player: Seat; where: "deck" | "hand" | "extra" }
  | { e: "target"; cards: EngineCardRef[] }
  | { e: "hint"; player: Seat; text: string }
  | { e: "win"; winner: Seat | null; reason: number };

export interface EngineStatus {
  turn: number;
  turnPlayer: Seat;
  phase: EnginePhase;
  lp: [number, number];
  finished: boolean;
  winner: Seat | null;
  /** Who the engine is waiting on, if anyone. */
  waitingFor: Seat | null;
}

/** Engine-mode server -> client messages. `prompt` reuses the existing ServerMsg slot. */
export type EngineServerMsg =
  | { t: "prompt"; prompt: EnginePrompt }
  | { t: "engineEvents"; events: EngineEvent[]; status: EngineStatus }
  | { t: "error"; message: string };

/** Engine-mode client -> server message (the existing ClientMsg `respond` slot). */
export type EngineClientMsg = { t: "respond"; response: EngineResponse };
