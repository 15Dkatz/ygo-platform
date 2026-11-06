// Phase 3's engine plug-in contract, implemented over EngineDuel (no WASM import here, so
// Node tests can drive it). Workers use ./roomHook.ts, which binds env + the bundled WASM.
//
// Everything is async under the hood (card data / scripts come from D1), so:
//   - `start()` creates the duel; on a *restored* session it rebuilds by replay and returns
//     the current board + open prompt (call it once after waking, before anything else);
//   - `exportBoard()` / `snapshot()` are sync and valid once `start()` has resolved.

import type { OcgCoreSync, OcgResponse } from "ocgcore-wasm";
import type { BoardState } from "../../../shared/duel.ts";
import type { EngineEvent, EnginePrompt, EngineResponse, Seat } from "../../../shared/enginePrompts.ts";
import type { EngineData } from "./data.ts";
import { BadResponse } from "./decode.ts";
import { EngineDuel, eventsFor, type DeckCodes, type DuelSetup, type SavedDuel } from "./EngineDuel.ts";

export { BadResponse };

/** Same shape as phase 3's EngineUpdate. `board` is unmasked; DuelRoom masks it per viewer. */
export interface RoomEngineUpdate {
  board?: BoardState;
  prompts?: { seat: Seat; prompt: EnginePrompt }[];
  log?: string[];
  finished?: { winner: Seat | null; reason: string };
  /** Extra (optional for DuelRoom): structured events per seat, already masked, for animations. */
  events?: [EngineEvent[], EngineEvent[]];
}

export interface RoomEngineSession {
  start(): Promise<RoomEngineUpdate>;
  respond(seat: Seat, response: unknown): Promise<RoomEngineUpdate>;
  exportBoard(): BoardState;
  snapshot(): unknown;
}

export interface RoomEngineOptions {
  names: [string, string];
  decks: [DeckCodes, DeckCodes];
  first: Seat;
  seed: Uint32Array;
  startingLP?: number;
}

const toJson = (r: OcgResponse) => JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? { $big: v.toString() } : v)));
const fromJson = (r: unknown) => JSON.parse(JSON.stringify(r), (_k, v) => (v && typeof v === "object" && "$big" in v ? BigInt(v.$big) : v)) as OcgResponse;

/** Spread a 32-bit-word seed over the core's four 64-bit seed words. */
function seedFrom(words: Uint32Array): DuelSetup["seed"] {
  const w = (i: number) => BigInt(words.length ? words[i % words.length] : i * 0x9e3779b9) ^ BigInt(Math.imul(i + 1, 0x85ebca6b) >>> 0);
  return [0, 1, 2, 3].map((i) => ((w(2 * i) << 32n) | w(2 * i + 1)).toString()) as DuelSetup["seed"];
}

export interface RoomEngineDeps { core: () => Promise<OcgCoreSync>; data: () => EngineData }

export function startRoomSession(deps: RoomEngineDeps, opts: RoomEngineOptions): RoomEngineSession {
  const setup: DuelSetup = { seed: seedFrom(opts.seed), decks: opts.decks, names: opts.names, first: opts.first, ...(opts.startingLP ? { startingLP: opts.startingLP } : {}) };
  return roomSession(deps, { setup, responses: [] });
}

export function restoreRoomSession(deps: RoomEngineDeps, snapshot: unknown): RoomEngineSession | null {
  const s = snapshot as { v?: number; setup?: DuelSetup; responses?: unknown[] } | null;
  if (!s || s.v !== 1 || !s.setup || !Array.isArray(s.responses)) return null;
  return roomSession(deps, { setup: s.setup, responses: s.responses.map(fromJson) });
}

function roomSession(deps: RoomEngineDeps, saved: SavedDuel): RoomEngineSession {
  let duel: EngineDuel | null = null;
  const ready = () => { if (!duel) throw new Error("engine session not started (await start() first)"); return duel; };
  const update = (d: EngineDuel, events: EngineEvent[]): RoomEngineUpdate => {
    const names = d.saved.setup.names ?? ["Player 1", "Player 2"];
    const pub = eventsFor(eventsFor(events, 0), 1);   // what both players may see
    const u: RoomEngineUpdate = {
      board: d.toBoardState(null),
      prompts: d.prompt ? [{ seat: d.prompt.player, prompt: d.prompt }] : [],
      log: pub.map((e) => describeEvent(e, names, (c) => d.cardName(c))).filter((x): x is string => !!x),
      events: [eventsFor(events, 0), eventsFor(events, 1)],
    };
    if (d.finished) u.finished = { winner: d.status.winner, reason: winReason(d, events) };
    return u;
  };
  return {
    async start() {
      if (!duel) {
        duel = await EngineDuel.restore(await deps.core(), deps.data(), saved);
      }
      return update(duel, duel.events);
    },
    async respond(seat, response) {
      const d = ready();
      return update(d, await d.respond(seat, response as EngineResponse));
    },
    exportBoard() { return ready().toBoardState(null); },
    snapshot() {
      const d = duel?.saved ?? saved;
      return { v: 1, setup: d.setup, responses: d.responses.map(toJson) };
    },
  };
}

// card-effect win reasons (WIN_REASON_* in CardScripts constant.lua)
const SPECIAL_WINS: Record<number, string> = {
  0x10: "Exodia", 0x11: "Final Countdown", 0x12: "Vennominaga", 0x13: "Creator God of Light, Horakhty", 0x14: "Exodius",
  0x15: "Destiny Board", 0x16: "Last Turn", 0x17: "Puppet Leo", 0x18: "Disaster Leo", 0x19: "Jackpot 7",
};
function winReason(d: EngineDuel, events: EngineEvent[]): string {
  const w = events.find((e) => e.e === "win");
  const code = w && w.e === "win" ? w.reason : -1;
  const loser = d.status.winner === null ? null : (1 - d.status.winner) as Seat;
  const why = SPECIAL_WINS[code] ?? (loser !== null && d.status.lp[loser] <= 0 ? "Life Points reached 0" : loser !== null ? "couldn't draw / other" : "duel over");
  return d.status.winner === null ? `Draw (${why})` : why;
}

const PHASE: Record<string, string> = { draw: "Draw Phase", standby: "Standby Phase", main1: "Main Phase 1", battle: "Battle Phase", main2: "Main Phase 2", end: "End Phase" };

/** One public log line per event (or null for noise). */
export function describeEvent(e: EngineEvent, names: [string, string], cardName: (code: number) => string | null = () => null): string | null {
  const card = (code: number) => (code ? cardName(code) ?? `#${code}` : "a card");
  switch (e.e) {
    case "turn": return `Turn ${e.turn}: ${names[e.player]}`;
    case "phase": return e.step ? null : PHASE[e.phase] ?? null;
    case "draw": return `${names[e.player]} drew ${e.codes.length} card${e.codes.length === 1 ? "" : "s"}`;
    case "summon": return `${names[e.card.controller]} ${e.how === "normal" ? "Normal" : e.how === "flip" ? "Flip" : "Special"} Summoned ${card(e.card.code)}`;
    case "set": return `${names[e.card.controller]} Set ${e.card.location === "monster" ? "a monster" : "a card"}`;
    case "chain": return `Chain ${e.link}: ${card(e.card.code)}${e.desc ? ` — ${e.desc}` : ""}`;
    case "chainNegated": return `Chain ${e.link} negated`;
    case "lp": return e.delta ? `${names[e.player]} ${e.delta < 0 ? "lost" : "gained"} ${Math.abs(e.delta)} LP (${e.lp})` : null;
    case "attack": return `${card(e.attacker.code)} attacks ${e.target ? card(e.target.code) : "directly"}`;
    case "coin": return `${names[e.player]} tossed a coin: ${e.results.map((h) => (h ? "heads" : "tails")).join(", ")}`;
    case "dice": return `${names[e.player]} rolled ${e.results.join(", ")}`;
    case "move":
      if (e.to?.location === "gy" && e.from && e.from.location !== "deck") return `${card(e.code)} was sent to the GY`;
      if (e.to?.location === "banished") return `${card(e.code)} was banished`;
      return null;
    case "win": return e.winner === null ? "The duel is a draw" : `${names[e.winner]} wins the duel`;
    default: return null;
  }
}
