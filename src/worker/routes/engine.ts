import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import ocgWasm from "ocgcore-wasm/lib/ocgcore.sync.wasm";
import { botResponse, seededRng } from "../duel/engine/bot.ts";
import { loadCore, wasmMemoryMB } from "../duel/engine/core.ts";
import { EngineData, d1Source } from "../duel/engine/data.ts";
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

/**
 * POST /api/engine/support { ids: number[] } -> { unsupported: { id, reason }[] }
 * Cards the rules engine can't play properly: unknown to its card database, or effect cards
 * without a script (they would have no effects). Alternate artworks count as their original.
 */
const TYPE_NORMAL = 0x10, TYPE_PENDULUM = 0x1000000, TYPE_TOKEN = 0x4000;
engine.post("/support", async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({ ids: [] }));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 300);
  const rows = new Map<number, { id: number; alias: number; type: number; has_script: number }>();
  const fetchRows = async (list: number[]) => {
    for (let i = 0; i < list.length; i += 90) {
      const chunk = list.slice(i, i + 90);
      const r = await c.env.DB.prepare(`SELECT id, alias, type, has_script FROM engine_cards WHERE id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk).all<{ id: number; alias: number; type: number; has_script: number }>();
      for (const row of r.results) rows.set(row.id, row);
    }
  };
  await fetchRows(ids);
  const canonical = (id: number) => { const a = rows.get(id)?.alias ?? 0; return a && Math.abs(a - id) < 20 ? a : id; };
  await fetchRows(ids.map(canonical).filter((id) => !rows.has(id)));
  const unsupported: { id: number; reason: string }[] = [];
  for (const id of ids) {
    const row = rows.get(canonical(id));
    if (!row) unsupported.push({ id, reason: "not in the rules engine yet" });
    else if (!row.has_script && !(row.type & TYPE_TOKEN) && (!(row.type & TYPE_NORMAL) || row.type & TYPE_PENDULUM)) {
      unsupported.push({ id, reason: "its effects aren't scripted yet" });
    }
  }
  return c.json({ unsupported });
});

// ---- data for engines running in the host's browser (host-runs-rules rooms) ----

/** POST /api/engine/cards { ids } -> { cards: EngineCardRow[] } (BabelCDB rows the core reads). */
engine.post("/cards", async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({ ids: [] }));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 2000);
  const rows = await d1Source(c.env.DB).cards(ids);
  c.header("Cache-Control", "no-store");
  return c.json({ cards: [...rows.values()] });
});

/** POST /api/engine/scripts { names } -> { scripts: { name: body | null } } (Lua from D1 engine_scripts). */
const SCRIPT_NAME = /^[A-Za-z0-9_.-]{1,80}\.lua$/;
engine.post("/scripts", async (c) => {
  const body = await c.req.json<{ names?: unknown }>().catch(() => ({ names: [] }));
  const names = [...new Set((Array.isArray(body.names) ? body.names : []).filter((n): n is string => typeof n === "string" && SCRIPT_NAME.test(n)))].slice(0, 600);
  const got = await d1Source(c.env.DB).scripts(names);
  c.header("Cache-Control", "no-store");
  return c.json({ scripts: Object.fromEntries(got) });
});

engine.get("/selftest", async (c) => {
  if (c.env.ENGINE_SELFTEST !== "1") return c.json({ error: "not found" }, 404);
  const seed = Number(c.req.query("seed") ?? 1) | 0;
  const t0 = Date.now();
  const core = await loadCore(() => ocgWasm);
  const t1 = Date.now();
  const duel = await EngineDuel.create(core, new EngineData(d1Source(c.env.DB)), {
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
