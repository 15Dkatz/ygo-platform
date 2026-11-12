// Duel state + websocket protocol shared by manual mode (phase 3) and engine mode (phase 4).
// The engine must be able to export its state as a `BoardState`, so that a rules-enforced
// duel can be switched to manual mode mid-duel without losing the board.

import type { DuelMode } from "./types.ts";
import type { RoomSettings } from "./roomSettings.ts";

export type Zone =
  | "deck" | "hand" | "extra" | "gy" | "banished"
  | "monster" | "spelltrap" | "field" | "extraMonster" | "pendulum";

export type Position = "atk" | "def" | "faceDownDef" | "faceDown"; // faceDown = set spell/trap

export interface CardInstance {
  uid: string;          // unique per physical copy in this duel
  code: number;         // catalogue card id
  owner: 0 | 1;
  faceUp: boolean;
  position?: Position;  // field zones only
  counters?: Record<string, number>;
  materials?: CardInstance[];   // Xyz materials attached to this card
  // --- additive (phase 3) ---
  token?: boolean;      // created by a "token" action; vanishes when it leaves the field
  controller?: 0 | 1;   // only set in the shared Extra Monster Zones (other zones imply the side)
  extraDeck?: boolean;  // started in the Extra Deck, so "return to deck" goes back there (never sent to a viewer for hidden cards)
  /** Current ATK / DEF of a face-up monster (rules-enforced duels: includes boosts). Never set for face-down cards. */
  atk?: number;
  def?: number;
}

export interface PlayerBoard {
  name: string;
  lp: number;
  deck: CardInstance[];        // index 0 = top
  hand: CardInstance[];
  extra: CardInstance[];
  gy: CardInstance[];
  banished: CardInstance[];
  monster: (CardInstance | null)[];     // 5 Main Monster Zones
  spelltrap: (CardInstance | null)[];   // 5 Spell & Trap Zones
  field: CardInstance | null;
  pendulum: (CardInstance | null)[];    // [left, right] (Master Rule 5: these are S/T zones 1 and 5; kept for clarity)
}

export interface BoardState {
  players: [PlayerBoard, PlayerBoard];
  extraMonster: (CardInstance | null)[];   // the 2 shared Extra Monster Zones
  turn: number;
  turnPlayer: 0 | 1;
  phase: "draw" | "standby" | "main1" | "battle" | "main2" | "end";
  log: string[];
}

export interface RoomInfo {
  roomId: string;
  name: string;
  mode: DuelMode;
  host: string;
  players: string[];
  status: "waiting" | "dueling" | "finished";
  created_at: string;
  spectators?: number;   // additive (phase 3)
  settings?: RoomSettings;
}

/** Per-player turn clock (ms). `running` = whose clock is ticking; it started at server time `since`.
 *  Clients estimate the server clock with `serverNow` (server time when the message was sent). */
export interface TurnClock { limitSec: number; remaining: [number, number]; running: 0 | 1 | null; since: number; serverNow: number }

/** Every websocket message is one JSON envelope. Phases may add new `t` values. */
export type ClientMsg =
  | { t: "join"; deckId: string; main: number[]; extra: number[]; side: number[] }
  | { t: "chat"; text: string }
  | { t: "action"; action: unknown }          // manual-mode board action (phase 3 defines)
  | { t: "respond"; response: unknown }       // answer to an engine prompt (phase 4 defines)
  | { t: "switchMode"; mode: DuelMode }       // both players must agree to leave engine mode
  | { t: "concede" }
  // --- additive (phase 3): pre-duel flow ---
  | { t: "rps"; choice: RpsChoice }            // rock-paper-scissors for who chooses turn order
  | { t: "coinToss" }                          // either player: let a coin decide instead of RPS
  | { t: "chooseOrder"; first: boolean }       // RPS/coin winner (or previous loser) picks
  | { t: "rematch" }                           // after a finished duel; both must ask
  | { t: "leave" }                             // give up the seat (before the duel) / forfeit (during)
  // --- additive (bot opponent, rules-enforced rooms): only the host (seat 0), before the duel ---
  | { t: "addBot"; deckId: string; main: number[]; extra: number[]; side: number[] }
  | { t: "removeBot" }
  // --- additive (host-runs-rules mode): only accepted from the host's socket ---
  | { t: "hostUpdate"; update: unknown; snapshot: unknown }   // one engine step, unmasked (the server masks per viewer);
                                                              // update.events (optional) = [seat 0's, seat 1's] masked events
  | { t: "hostError"; seat: 0 | 1; message: string };         // the engine refused that player's answer

export type ServerMsg =
  | { t: "room"; room: RoomInfo; you: 0 | 1 | null }
  | { t: "state"; state: BoardState }         // full state, hidden info already masked per viewer
  | { t: "chat"; from: string; text: string; at?: number; system?: boolean }   // at/system: additive (phase 3)
  | { t: "prompt"; prompt: unknown }          // engine asks this player to choose (phase 4)
  | { t: "error"; message: string }
  // --- additive (phase 3) ---
  | { t: "session"; session: SessionInfo }    // seats, pre-duel stage, winner; sent on every change
  | { t: "peek"; title: string; cards: CardInstance[] }   // private: only to the player who looked (top N / deck search)
  | { t: "event"; event: DuelEvent }          // transient effect for toasts/animations (attack, reveal, dice, coin)
  // --- additive (host-runs-rules mode): only sent to the host ---
  | { t: "engineHost"; start?: EngineHostStart; snapshot?: unknown; bot?: 0 | 1 }   // run (or resume) this duel's engine; `bot`: the seat the host's engine answers itself
  | { t: "engineRespond"; seat: 0 | 1; response: unknown }             // a player's answer, for the host's engine
  // --- additive (engine animations): what one engine step did, masked for this viewer.
  //     Sent right before the `state` it led to (EngineEvent[] from enginePrompts.ts). ---
  | { t: "engineEvents"; events: unknown[] };

/** What the host's browser needs to create the duel (same as the server's RoomEngineOptions). */
export interface EngineHostStart {
  names: [string, string];
  decks: [{ main: number[]; extra: number[] }, { main: number[]; extra: number[] }];
  first: 0 | 1;
  seed: number[];   // 32-bit words
  startingLP?: number;
  /** Demo rooms (vs a bot) only: decks keep their order, so the demo's combo pieces are in the opening hands. */
  stacked?: boolean;
}

/** Log lines may contain card tokens `[[12345]]` that the client renders as the card's name. */
export const cardToken = (code: number) => `[[${code}]]`;

export type RpsChoice = "rock" | "paper" | "scissors";

export type DuelStage =
  | "lobby"     // waiting for two players with decks
  | "rps"       // both pick rock/paper/scissors (or toss a coin)
  | "choose"    // `chooser` decides to go first or second
  | "duel"      // board is live
  | "finished"; // `winner` set (null = draw); players may side-deck and ask for a rematch

export interface SeatInfo {
  name: string;
  bot?: boolean;      // a computer opponent (rules-enforced rooms only)
  connected: boolean;
  ready: boolean;                                   // deck submitted
  deck?: { main: number; extra: number; side: number };
}

export interface SessionInfo {
  stage: DuelStage;
  mode: DuelMode;               // current mode of the room
  seats: [SeatInfo | null, SeatInfo | null];
  spectators: number;
  rps: { mine: RpsChoice | null; opponentPicked: boolean; last?: { choices: [RpsChoice, RpsChoice]; winner: 0 | 1 | null } };
  chooser: 0 | 1 | null;        // who picks turn order (stage "choose")
  winner: 0 | 1 | null;         // stage "finished"
  endReason?: string;
  rematch: [boolean, boolean];
  /** Engine mode is not playable yet: the room asks both players to agree to play manually. */
  engineNotice?: string;
  switchVotes?: [boolean, boolean];
  /** Rules-enforced room whose engine runs in a player's browser: that player's seat. */
  engineHost?: 0 | 1;
  settings?: RoomSettings;
  timer?: TurnClock;
}

export type DuelEvent =
  | { kind: "attack"; player: 0 | 1; attacker: string; target: string | null }   // uids; null = direct
  | { kind: "reveal"; player: 0 | 1; cards: CardInstance[] }
  | { kind: "dice"; player: 0 | 1; value: number }
  | { kind: "coin"; player: 0 | 1; heads: boolean };

/** Hidden cards are sent with code 0 to the viewer who must not see them. */
export const HIDDEN_CODE = 0;
