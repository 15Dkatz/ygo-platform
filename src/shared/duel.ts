// Duel state + websocket protocol shared by manual mode (phase 3) and engine mode (phase 4).
// The engine must be able to export its state as a `BoardState`, so that a rules-enforced
// duel can be switched to manual mode mid-duel without losing the board.

import type { DuelMode } from "./types.ts";

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
}

/** Every websocket message is one JSON envelope. Phases may add new `t` values. */
export type ClientMsg =
  | { t: "join"; deckId: string; main: number[]; extra: number[]; side: number[] }
  | { t: "chat"; text: string }
  | { t: "action"; action: unknown }          // manual-mode board action (phase 3 defines)
  | { t: "respond"; response: unknown }       // answer to an engine prompt (phase 4 defines)
  | { t: "switchMode"; mode: DuelMode }       // both players must agree to leave engine mode
  | { t: "concede" };

export type ServerMsg =
  | { t: "room"; room: RoomInfo; you: 0 | 1 | null }
  | { t: "state"; state: BoardState }         // full state, hidden info already masked per viewer
  | { t: "chat"; from: string; text: string }
  | { t: "prompt"; prompt: unknown }          // engine asks this player to choose (phase 4)
  | { t: "error"; message: string };

/** Hidden cards are sent with code 0 to the viewer who must not see them. */
export const HIDDEN_CODE = 0;
