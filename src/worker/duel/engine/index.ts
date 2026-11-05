// Rules engine (phase 4) — what DuelRoom imports. See session.ts for the call sequence.
import ocgWasm from "ocgcore-wasm/lib/ocgcore.sync.wasm";
import type { Env } from "../../env.ts";
import { loadCore } from "./core.ts";
import { EngineData, d1Source } from "./data.ts";
import { createSession, type EngineSession } from "./session.ts";

export type { EngineSession, EngineUpdate, EngineStartOptions } from "./session.ts";
export { BadResponse } from "./decode.ts";

/** Engine session for a Durable Object: core from the bundled WASM, data from D1. */
export function createEngineSession(env: Env, storage: DurableObjectStorage): EngineSession {
  return createSession({
    storage,
    core: () => loadCore(() => ocgWasm),   // static .wasm import = precompiled module (Workers forbid runtime compile)
    data: () => new EngineData(d1Source(env.DB)),
  });
}
