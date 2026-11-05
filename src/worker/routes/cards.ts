import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { rowToCard } from "../../shared/normalize.ts";

export const cards = new Hono<AppEnv>();

const D1_MAX_PARAMS = 90; // D1 allows 100 bound parameters per statement

const SORTS: Record<string, string> = {
  name: "name COLLATE NOCASE",
  date: "release_date",
  atk: "atk",
  def: "defense",
  level: "COALESCE(level, linkval)",
  views: "views",
  id: "id",
};

/**
 * GET /api/cards/search — catalogue search for the deck builder.
 * Query: q, text=1 (also match card text/archetype), category, kind, attribute, race,
 * archetype (substring), type (substring), level, atk_min, atk_max, def_min, def_max,
 * ban=tcg-forbidden|tcg-limited|..., sort, dir=asc|desc, limit (<=200), offset.
 */
cards.get("/search", async (c) => {
  const p = c.req.query();
  const where: string[] = [];
  const args: unknown[] = [];
  const words = (p.q || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  for (const w of words) {
    if (p.text === "1") {
      where.push("(lower(name) LIKE ? OR lower(desc) LIKE ? OR lower(COALESCE(archetype,'')) LIKE ?)");
      args.push(`%${w}%`, `%${w}%`, `%${w}%`);
    } else {
      where.push("lower(name) LIKE ?");
      args.push(`%${w}%`);
    }
  }
  for (const f of ["category", "kind", "attribute", "race"] as const) {
    if (p[f]) { where.push(`lower(${f}) = lower(?)`); args.push(p[f]); }
  }
  for (const f of ["archetype", "type"] as const) {
    if (p[f]) { where.push(`lower(COALESCE(${f},'')) LIKE ?`); args.push(`%${p[f].toLowerCase()}%`); }
  }
  if (p.level) { where.push("COALESCE(level, linkval) = ?"); args.push(Number(p.level)); }
  const range: [string, string, string][] = [["atk_min", "atk", ">="], ["atk_max", "atk", "<="], ["def_min", "defense", ">="], ["def_max", "defense", "<="]];
  for (const [k, col, op] of range) if (p[k]) { where.push(`${col} ${op} ?`); args.push(Number(p[k])); }
  if (p.ban) {
    const [fmt, ...rest] = p.ban.split("-");
    const col = fmt === "ocg" ? "ban_ocg" : "ban_tcg";
    const status = rest.join("-");
    where.push(status === "forbidden" ? `lower(${col}) IN ('banned','forbidden')` : `lower(${col}) = ?`);
    if (status !== "forbidden") args.push(status);
  }
  const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sort = SORTS[p.sort || "name"] || SORTS.name;
  const dir = p.dir === "desc" ? "DESC" : "ASC";
  const limit = Math.min(200, Math.max(1, Number(p.limit) || 60));
  const offset = Math.max(0, Number(p.offset) || 0);
  const [rows, total] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM cards ${sql} ORDER BY ${sort} IS NULL, ${sort} ${dir}, name LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    c.env.DB.prepare(`SELECT count(*) AS n FROM cards ${sql}`).bind(...args),
  ]);
  return c.json({
    cards: (rows.results as Record<string, unknown>[]).map(rowToCard),
    total: (total.results[0] as { n: number }).n,
  });
});

/**
 * POST /api/cards/lookup {ids: number[]} — resolve .ydk ids (including alternate-art ids).
 * Returns { cards, alias: {rawId: canonicalId}, missing: rawId[] }.
 */
cards.post("/lookup", async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({ ids: [] }));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger))].slice(0, 20000);
  const alias: Record<number, number> = {};
  for (let i = 0; i < ids.length; i += D1_MAX_PARAMS) {
    const chunk = ids.slice(i, i + D1_MAX_PARAMS);
    const r = await c.env.DB.prepare(`SELECT alias_id, card_id FROM card_alias WHERE alias_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ alias_id: number; card_id: number }>();
    for (const row of r.results) alias[row.alias_id] = row.card_id;
  }
  const canonical = [...new Set(Object.values(alias))];
  const found: Record<string, unknown>[] = [];
  for (let i = 0; i < canonical.length; i += D1_MAX_PARAMS) {
    const chunk = canonical.slice(i, i + D1_MAX_PARAMS);
    const r = await c.env.DB.prepare(`SELECT * FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all();
    found.push(...(r.results as Record<string, unknown>[]));
  }
  return c.json({ cards: found.map(rowToCard), alias, missing: ids.filter((id) => !(id in alias)) });
});

/** GET /api/cards/facets — distinct values for filter dropdowns. */
cards.get("/facets", async (c) => {
  const q = (col: string) => c.env.DB.prepare(`SELECT DISTINCT ${col} AS v FROM cards WHERE ${col} IS NOT NULL ORDER BY ${col}`);
  const [kind, attribute, race, archetype] = await c.env.DB.batch([q("kind"), q("attribute"), q("race"), q("archetype")]);
  const vals = (r: D1Result) => (r.results as { v: string }[]).map((x) => x.v);
  const meta = await c.env.DB.prepare("SELECT value FROM meta WHERE key = 'imported_at'").first<{ value: string }>();
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ kind: vals(kind), attribute: vals(attribute), race: vals(race), archetype: vals(archetype), imported_at: meta?.value ?? null });
});

/** GET /api/cards/:id — one card by id or alias id. */
cards.get("/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT c.* FROM cards c JOIN card_alias a ON a.card_id = c.id WHERE a.alias_id = ?").bind(id).first();
  return row ? c.json(rowToCard(row)) : c.json({ error: "not found" }, 404);
});
