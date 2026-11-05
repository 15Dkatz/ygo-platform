// THE single place where engine mode (phase 4, src/worker/duel/engine/*) plugs into DuelRoom.
//
// DuelRoom calls:
//   - engineAvailable()                  when two players are seated in an "engine" room. While it
//                                        returns false the room shows ENGINE_NOTICE and lets both
//                                        players vote to switch to manual ({ t: "switchMode" }).
//   - startEngineDuel(...)               instead of the manual createBoard() when the duel starts.
//   - session.respond(seat, response)    for { t: "respond" } messages.
//   - session.exportBoard()              when both players switch an engine duel to manual mode
//                                        (DuelRoom then continues with the manual reducer on that BoardState).
// The returned `EngineUpdate`s are what DuelRoom broadcasts: a new BoardState (masked per viewer by
// DuelRoom with maskBoard) and/or prompts for one player.

import type { BoardState } from "../../shared/duel.ts";
import type { Seat } from "../../shared/duelActions.ts";
import type { DeckList } from "./manual/board.ts";

export const ENGINE_NOTICE = "Rules-enforced duels are coming soon. Both players can agree to play this room manually.";

export interface EngineUpdate {
  board?: BoardState;
  prompts?: { seat: Seat; prompt: unknown }[];
  log?: string[];
  finished?: { winner: Seat | null; reason: string };
}

export interface EngineSession {
  start(): Promise<EngineUpdate>;
  respond(seat: Seat, response: unknown): Promise<EngineUpdate>;
  exportBoard(): BoardState;
  /** Serializable state, stored by DuelRoom in DO storage so the duel survives hibernation. */
  snapshot(): unknown;
}

/** DuelRoom now drives the engine directly through ./engine/roomHook.ts (it needs `env`). */
export function engineAvailable(): boolean {
  return true;
}

export function startEngineDuel(_opts: { names: [string, string]; decks: [DeckList, DeckList]; first: Seat; seed: Uint32Array }): EngineSession {
  throw new Error("engine mode is not implemented yet");
}

export function restoreEngineDuel(_snapshot: unknown): EngineSession | null {
  return null;
}
