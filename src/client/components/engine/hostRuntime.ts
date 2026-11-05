// Host-runs-rules mode: the room host's browser runs the rules engine. This is the exact
// engine session the server runs in "server" mode (src/worker/duel/engine/roomSession.ts);
// only its data source differs (card rows + Lua scripts come from /api/engine/*).
// The room relays every player's answer here and stores/masks/broadcasts what we send back.
// Loaded lazily (dynamic import), so only hosts download the ~1 MB engine.

import wasmUrl from "ocgcore-wasm/lib/ocgcore.sync.wasm?url";
import { api } from "../../api.ts";
import type { ClientMsg, EngineHostStart } from "../../../shared/duel.ts";
import { loadCore } from "../../../worker/duel/engine/core.ts";
import { EngineData, type EngineCardRow, type EngineDataSource } from "../../../worker/duel/engine/data.ts";
import { BadResponse } from "../../../worker/duel/engine/decode.ts";
import { restoreRoomSession, startRoomSession, type RoomEngineDeps, type RoomEngineSession, type RoomEngineUpdate } from "../../../worker/duel/engine/roomSession.ts";

const source: EngineDataSource = {
  async cards(codes) {
    const out = new Map<number, EngineCardRow>();
    for (let i = 0; i < codes.length; i += 1000) {
      const r = await api<{ cards: EngineCardRow[] }>("/api/engine/cards", { method: "POST", json: { ids: codes.slice(i, i + 1000) } });
      for (const c of r.cards) out.set(c.id, c);
    }
    return out;
  },
  async scripts(names) {
    const out = new Map<string, string | null>();
    const chunks: string[][] = [];
    for (let i = 0; i < names.length; i += 300) chunks.push(names.slice(i, i + 300));
    await Promise.all(chunks.map(async (chunk) => {
      const r = await api<{ scripts: Record<string, string | null> }>("/api/engine/scripts", { method: "POST", json: { names: chunk } });
      for (const n of chunk) out.set(n, r.scripts[n] ?? null);
    }));
    return out;
  },
};

async function compileWasm(): Promise<WebAssembly.Module> {
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`could not download the rules engine (${res.status})`);
  // compileStreaming needs the application/wasm content type; fall back to bytes otherwise
  if (WebAssembly.compileStreaming && res.headers.get("content-type")?.includes("application/wasm")) return WebAssembly.compileStreaming(res);
  return WebAssembly.compile(await res.arrayBuffer());
}

const deps: RoomEngineDeps = {
  core: () => loadCore(compileWasm),
  data: () => new EngineData(source),
};

export interface HostJob { start?: EngineHostStart; snapshot?: unknown }

export class EngineHost {
  private session: RoomEngineSession | null = null;
  private key = "";
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private send: (m: ClientMsg) => void, private onStatus: (s: string | null) => void) {}

  /** Start (or resume) the room's duel. Repeated jobs for the duel we already run are ignored. */
  run(job: HostJob) {
    const key = JSON.stringify(job.start?.seed ?? null);
    if (this.session && key === this.key) return;
    this.enqueue(async () => {
      this.key = key;
      this.onStatus("Loading the rules engine…");
      let session = job.snapshot ? restoreRoomSession(deps, job.snapshot) : null;
      if (!session && job.start) session = startRoomSession(deps, { ...job.start, seed: Uint32Array.from(job.start.seed) });
      if (!session) throw new Error("this duel can't be started: no setup or saved moves");
      this.session = session;
      const update = await session.start();
      this.onStatus(null);
      // resuming replays old moves: their events were animated when they happened
      this.push(job.snapshot ? { ...update, events: undefined } : update);
    });
  }

  /** A player's answer, relayed by the room. */
  respond(seat: 0 | 1, response: unknown) {
    this.enqueue(async () => {
      if (!this.session) return;
      try {
        this.push(await this.session.respond(seat, response));
      } catch (e) {
        if (e instanceof BadResponse) this.send({ t: "hostError", seat, message: e.message });
        else throw e;
      }
    });
  }

  private push(u: RoomEngineUpdate) {
    // per-seat `events` (already masked for each seat) drive the animations; the room forwards them
    const update = { board: u.board, prompts: u.prompts, log: u.log, finished: u.finished, events: u.events };
    this.send({ t: "hostUpdate", update, snapshot: this.session!.snapshot() });
  }

  private enqueue(fn: () => Promise<void>) {
    this.queue = this.queue.then(fn).catch((e) => {
      console.error("rules engine", e);
      this.onStatus(`The rules engine stopped: ${(e as Error)?.message ?? e}. Reload the page to resume, or switch the room to manual.`);
    });
  }
}
