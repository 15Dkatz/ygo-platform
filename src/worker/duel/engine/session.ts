// The engine session a DuelRoom drives (create it with `createEngineSession` from ./index.ts).
//
//   const engine = createEngineSession(this.env, this.ctx.storage);
//   await engine.load();                         // on wake: true if a duel was in progress
//   const up = await engine.start({ decks, names });
//   const up = await engine.respond(seat, msg.response);
//   for (const seat of [0, 1]) send(seat, engine.messagesFor(seat, up));
//   engine.toBoardState(seat)                    // masked BoardState for `{ t: "state" }`
//   const board = await engine.stop();           // switch to manual: full board, engine data cleared
//
// Persistence: the setup goes in storage key "engine:setup" and each response in
// "engine:r:<000123>", written as it is accepted. After eviction/hibernation `load()` replays
// them (~0.5 ms per response) to rebuild the WASM state.

import type { OcgCoreSync, OcgResponse } from "ocgcore-wasm";
import type { BoardState } from "../../../shared/duel.ts";
import type { EngineEvent, EnginePrompt, EngineResponse, EngineServerMsg, EngineStatus, Seat } from "../../../shared/enginePrompts.ts";
import type { EngineData } from "./data.ts";
import { BadResponse } from "./decode.ts";
import { EngineDuel, eventsFor, randomSeed, type DeckCodes, type DuelSetup, type SavedDuel } from "./EngineDuel.ts";

export { BadResponse };

export interface EngineUpdate {
  events: EngineEvent[];
  status: EngineStatus;
  prompt: EnginePrompt | null;
}

export interface EngineStartOptions {
  decks: [DeckCodes, DeckCodes];   // by seat
  names?: [string, string];
  /** Seat that goes first; default: a coin flip. */
  first?: Seat;
  startingLP?: number;
}

export interface EngineSession {
  readonly active: boolean;
  readonly status: EngineStatus | null;
  /** Restore a duel saved in storage (after eviction). Returns false if there is none. */
  load(): Promise<boolean>;
  start(opts: EngineStartOptions): Promise<EngineUpdate>;
  /** Throws BadResponse (message is safe to show) for an invalid/out-of-turn answer. */
  respond(seat: Seat, response: EngineResponse): Promise<EngineUpdate>;
  /** The open prompt if it is addressed to `seat`. */
  promptFor(seat: Seat): EnginePrompt | null;
  /** BoardState masked for `viewer` (null = everything, for the manual-mode handoff). */
  toBoardState(viewer: Seat | null): BoardState;
  /** What to send each seat after an update: masked events + status, then its prompt if any. */
  messagesFor(seat: Seat, update: EngineUpdate): EngineServerMsg[];
  /** End engine mode: returns the full board for manual mode and deletes the engine data. */
  stop(): Promise<BoardState | null>;
}

const SETUP_KEY = "engine:setup";
const RESP_PREFIX = "engine:r:";
const respKey = (i: number) => `${RESP_PREFIX}${String(i).padStart(6, "0")}`;

// OcgResponse can hold bigints (announce race); keep storage JSON-safe.
const toJson = (r: OcgResponse) => JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? { $big: v.toString() } : v)));
const fromJson = (r: unknown) => JSON.parse(JSON.stringify(r), (_k, v) => (v && typeof v === "object" && "$big" in v ? BigInt(v.$big) : v)) as OcgResponse;

/** The storage subset the session uses (DurableObjectStorage satisfies it). */
export type EngineStorage = Pick<DurableObjectStorage, "get" | "put" | "delete" | "list">;

/** Session with injectable dependencies. Workers use `createEngineSession` from ./index.ts;
 *  tests run this in Node with a Map-backed storage. */
export function createSession(deps: {
  storage: EngineStorage;
  core: () => Promise<OcgCoreSync>;
  data: () => EngineData;
}): EngineSession {
  let duel: EngineDuel | null = null;
  const { storage, core, data } = deps;

  const update = (d: EngineDuel, events: EngineEvent[]): EngineUpdate => ({ events, status: { ...d.status, lp: [...d.status.lp] as [number, number] }, prompt: d.prompt });
  const need = () => { if (!duel) throw new BadResponse("no engine duel in progress"); return duel; };

  return {
    get active() { return !!duel && !duel.finished; },
    get status() { return duel?.status ?? null; },

    async load() {
      if (duel) return true;
      const setup = await storage.get<DuelSetup>(SETUP_KEY);
      if (!setup) return false;
      const rows = await storage.list({ prefix: RESP_PREFIX });
      const saved: SavedDuel = { setup, responses: [...rows.values()].map(fromJson) };
      duel = await EngineDuel.restore(await core(), data(), saved);
      return true;
    },

    async start(opts) {
      duel?.destroy();
      await clearResponses();
      const setup: DuelSetup = {
        seed: randomSeed(),
        decks: opts.decks,
        names: opts.names,
        first: opts.first ?? (crypto.getRandomValues(new Uint8Array(1))[0] & 1) as Seat,
        startingLP: opts.startingLP,
      };
      duel = await EngineDuel.create(await core(), data(), setup);
      await storage.put(SETUP_KEY, setup);
      // the engine may have auto-answered empty chain windows while starting
      await persistNew(duel, 0);
      return update(duel, duel.events);
    },

    async respond(seat, response) {
      const d = need();
      const before = d.saved.responses.length;
      const events = await d.respond(seat, response);
      await persistNew(d, before);
      return update(d, events);
    },

    promptFor(seat) {
      return duel?.prompt?.player === seat ? duel.prompt : null;
    },

    toBoardState(viewer) {
      return need().toBoardState(viewer);
    },

    messagesFor(seat, up) {
      const out: EngineServerMsg[] = [{ t: "engineEvents", events: eventsFor(up.events, seat), status: up.status }];
      if (up.prompt && up.prompt.player === seat) out.push({ t: "prompt", prompt: up.prompt });
      return out;
    },

    async stop() {
      const board = duel ? duel.toBoardState(null) : null;
      duel?.destroy();
      duel = null;
      await storage.delete(SETUP_KEY);
      await clearResponses();
      return board;
    },
  };

  async function clearResponses() {
    const keys = [...(await storage.list({ prefix: RESP_PREFIX })).keys()];
    for (let i = 0; i < keys.length; i += 128) await storage.delete(keys.slice(i, i + 128));   // 128 keys per call
  }

  async function persistNew(d: EngineDuel, from: number) {
    // storage.put takes at most 128 keys per call
    for (let start = from; start < d.saved.responses.length; start += 128) {
      const entries: Record<string, unknown> = {};
      for (let i = start; i < Math.min(start + 128, d.saved.responses.length); i++) entries[respKey(i)] = toJson(d.saved.responses[i]);
      await storage.put(entries);
    }
  }
}
