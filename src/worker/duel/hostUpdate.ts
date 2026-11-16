// Host-run engine mode: checks an engine update from the host's browser before DuelRoom stores and
// broadcasts it.
import type { BoardState } from "../../shared/duel.ts";
import type { Seat } from "../../shared/duelActions.ts";
import type { RoomEngineUpdate } from "./engine/roomHook.ts";
import type { EngineEvent } from "../../shared/enginePrompts.ts";

export class RoomError extends Error {}

export type EnginePromptEntry = NonNullable<RoomEngineUpdate["prompts"]>[number];

/** Sanity-check an engine update from the host's browser before storing and broadcasting it.
 *  (The host is trusted with the rules in this mode; this only keeps malformed data out.) */
export function checkHostUpdate(raw: unknown): RoomEngineUpdate {
  const u = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bad = (why: string) => new RoomError(`Bad engine update (${why}).`);
  const out: RoomEngineUpdate = {};
  if (u.board !== undefined) {
    const b = u.board as BoardState;
    if (!b || typeof b !== "object" || !Array.isArray(b.players) || b.players.length !== 2 || !Array.isArray(b.extraMonster)) throw bad("board");
    out.board = b;
  }
  if (u.prompts !== undefined) {
    if (!Array.isArray(u.prompts) || u.prompts.length > 2) throw bad("prompts");
    out.prompts = (u.prompts as { seat: unknown; prompt: unknown }[]).map((x) => {
      if (!x || (x.seat !== 0 && x.seat !== 1) || !x.prompt || typeof x.prompt !== "object") throw bad("prompt");
      return { seat: x.seat, prompt: x.prompt } as EnginePromptEntry;
    });
  }
  if (u.log !== undefined) {
    if (!Array.isArray(u.log)) throw bad("log");
    out.log = u.log.filter((l): l is string => typeof l === "string").slice(0, 200).map((l) => l.slice(0, 300));
  }
  if (u.finished !== undefined && u.finished !== null) {
    const f = u.finished as { winner?: unknown; reason?: unknown };
    if (f.winner !== 0 && f.winner !== 1 && f.winner !== null) throw bad("result");
    out.finished = { winner: f.winner as Seat | null, reason: String(f.reason ?? "Duel over").slice(0, 120) };
  }
  // optional per-seat animation events; the host already masked them for each seat
  if (Array.isArray(u.events) && u.events.length === 2 && u.events.every((l) => Array.isArray(l))) {
    const clean = (l: unknown[]) => l.filter((e): e is EngineEvent => !!e && typeof e === "object" && typeof (e as { e?: unknown }).e === "string").slice(0, 400);
    const ev = [clean(u.events[0] as unknown[]), clean(u.events[1] as unknown[])] as [EngineEvent[], EngineEvent[]];
    if (JSON.stringify(ev).length <= 200_000) out.events = ev;
  }
  return out;
}
