// Implementation of phase 3's engine plug-in contract (src/worker/duel/engineHook.ts on the
// phase-3 branch): `startEngineDuel`, `restoreEngineDuel`, and an EngineSession with
// start / respond / exportBoard / snapshot. The phase-3 hook takes no `env`, so these take it
// as an extra first argument; the lead wires them in engineHook.ts (see the phase-4 report):
//
//   export const engineAvailable = () => true;
//   export const startEngineDuel = (opts) => startRoomEngine(env, opts);       // env from DuelRoom
//   export const restoreEngineDuel = (snap) => restoreRoomEngine(env, snap);
//
// Everything is async under the hood (card data / scripts come from D1 + R2), so:
//   - `start()` creates the duel; on a *restored* session it rebuilds by replay and returns
//     the current board + open prompt (call it once after waking, before anything else);
//   - `exportBoard()` / `snapshot()` are sync and valid once `start()` has resolved.

import ocgWasm from "ocgcore-wasm/lib/ocgcore.sync.wasm";
import type { Env } from "../../env.ts";
import { loadCore } from "./core.ts";
import { EngineData, d1r2Source } from "./data.ts";
import { restoreRoomSession, startRoomSession, type RoomEngineDeps, type RoomEngineOptions, type RoomEngineSession } from "./roomSession.ts";

export type { RoomEngineOptions, RoomEngineSession, RoomEngineUpdate } from "./roomSession.ts";
export { BadResponse } from "./decode.ts";

const deps = (env: Env): RoomEngineDeps => ({
  core: () => loadCore(() => ocgWasm),
  data: () => new EngineData(d1r2Source(env.DB, env.SCRIPTS)),
});

export function startRoomEngine(env: Env, opts: RoomEngineOptions): RoomEngineSession {
  return startRoomSession(deps(env), opts);
}

/** null if the snapshot isn't one of ours (e.g. from an older format). */
export function restoreRoomEngine(env: Env, snapshot: unknown): RoomEngineSession | null {
  return restoreRoomSession(deps(env), snapshot);
}
