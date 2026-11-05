import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import ocgWasm from "ocgcore-wasm/lib/ocgcore.sync.wasm";
import { botResponse, seededRng } from "../duel/engine/bot.ts";
import { loadCore, wasmMemoryMB } from "../duel/engine/core.ts";
import { EngineData, d1r2Source } from "../duel/engine/data.ts";
import { EngineDuel } from "../duel/engine/EngineDuel.ts";
import { TEST_DECK_A, TEST_DECK_B } from "../duel/engine/testDecks.ts";
import { LICENSE_NAME, SOURCE_URL } from "../../shared/project.ts";

// PHASE 4 (rules engine) routes.
//   GET /api/engine/source    where to get the source of the AGPL engine components (AGPL §13)
//   GET /api/engine/selftest  bot-vs-bot duel inside the Worker (only when ENGINE_SELFTEST=1)

export const engine = new Hono<AppEnv>();

engine.get("/source", (c) => c.json({
  license: "AGPL-3.0-or-later (engine components)",
  components: [
    { name: "ygopro-core (EDOPro core / ocgcore)", url: "https://github.com/edo9300/ygopro-core", license: "AGPL-3.0" },
    { name: "ocgcore-wasm (WASM build + JS bindings)", url: "https://github.com/n1xx1/ocgcore-wasm", license: "MIT (core inside: AGPL-3.0)" },
    { name: "ProjectIgnis CardScripts", url: "https://github.com/ProjectIgnis/CardScripts", license: "AGPL-3.0" },
    { name: "ProjectIgnis BabelCDB", url: "https://github.com/ProjectIgnis/BabelCDB", license: "see repository" },
  ],
  app: { name: "YGO Duel Hub (this service, including its engine integration)", url: SOURCE_URL, license: LICENSE_NAME },
}));

engine.get("/selftest", async (c) => {
  if (c.env.ENGINE_SELFTEST !== "1") return c.json({ error: "not found" }, 404);
  const seed = Number(c.req.query("seed") ?? 1) | 0;
  const t0 = Date.now();
  const core = await loadCore(() => ocgWasm);
  const t1 = Date.now();
  const duel = await EngineDuel.create(core, new EngineData(d1r2Source(c.env.DB, c.env.SCRIPTS)), {
    seed: [String(seed), String(seed * 7 + 1), String(seed * 13 + 2), String(seed * 31 + 3)],
    decks: [TEST_DECK_A, TEST_DECK_B], names: ["Bot A", "Bot B"], first: 0,
  });
  const t2 = Date.now();
  const rng = seededRng(seed);
  let steps = 0;
  while (!duel.finished && duel.prompt && steps < 4000) {
    await duel.respond(duel.prompt.player, botResponse(duel.prompt, rng));
    steps++;
  }
  const t3 = Date.now();
  const result = {
    finished: duel.finished, winner: duel.status.winner, turns: duel.status.turn, lp: duel.status.lp,
    responses: duel.saved.responses.length, botSteps: steps, rebuilds: duel.rebuilds,
    // Date.now() only advances across I/O in Workers, so these are coarse wall-clock numbers
    ms: { loadCore: t1 - t0, createDuel: t2 - t1, playOut: t3 - t2 },
    wasmMemoryMB: wasmMemoryMB(core),
  };
  duel.destroy();
  return c.json(result);
});
