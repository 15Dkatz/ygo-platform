import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../env.ts";
import type { CustomTags, Deck } from "../../shared/types.ts";
import { requireUser } from "./auth.ts";
import { cleanRarities } from "../../shared/rarity.ts";
import { DEFAULT_SLEEVE, cleanSleeve } from "../../shared/sleeves.ts";

// PHASE 2 (accounts) owns this file: per-user deck + custom-tag storage in D1.
// Contract (all require sign-in, bodies use the shared `Deck` type):
//   GET    /api/decks            -> { decks: Deck[] }
//   GET    /api/decks/:id        -> { deck }              (404 when not yours / missing)
//   PUT    /api/decks/:id        Deck -> { deck }        (create or replace)
//   POST   /api/decks/bulk       { decks: Deck[] } -> { count }   (folder import, ≤ 500 per request)
//   DELETE /api/decks/:id        -> { ok }
//   GET    /api/decks/tags       -> { tags: CustomTags }
//   PUT    /api/decks/tags       { tags: CustomTags } -> { ok }
// Errors are { error } with 400 (invalid input), 401 (signed out), 404, 413 (too many / too large).

export const MAX_DECKS_PER_USER = 2000;
export const MAX_CARDS_PER_SECTION = 100;
export const MAX_DECK_NAME = 100;
export const MAX_BULK = 500;
export const MAX_TAG_ENTRIES = 20_000;
export const MAX_TAGS_PER_CARD = 50;
export const MAX_TAG_LENGTH = 64;
export const MAX_CARD_NAME = 200;

/** D1 allows 100 bound parameters per statement; stay under it. */
const MAX_PARAMS = 90;
const DECK_COLS = 12;
const TAG_COLS = 3;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_IDS = new Set(["tags", "bulk"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

class BadInput extends Error {}

function cardList(v: unknown, section: string): number[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new BadInput(`${section} must be an array of card ids`);
  if (v.length > MAX_CARDS_PER_SECTION) throw new BadInput(`${section} has more than ${MAX_CARDS_PER_SECTION} cards`);
  for (const id of v) {
    if (!Number.isSafeInteger(id) || id < 0 || id > 9_999_999_999) throw new BadInput(`${section} contains an invalid card id`);
  }
  return v as number[];
}

function optDate(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 40 || !DATE_RE.test(v)) throw new BadInput(`${field} must be a date (YYYY-MM-DD)`);
  return v;
}

function timestamp(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length <= 40 && DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) ? v : fallback;
}

/** Validate and normalise one incoming deck. `keepTimes` preserves client timestamps (imports). */
function parseDeck(raw: unknown, now: string, keepTimes: boolean): Deck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BadInput("deck must be an object");
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== "string" || !ID_RE.test(d.id) || RESERVED_IDS.has(d.id)) throw new BadInput("deck id is invalid");
  const name = typeof d.name === "string" ? d.name.trim() : "";
  if (!name) throw new BadInput("deck name is required");
  if (name.length > MAX_DECK_NAME) throw new BadInput(`deck name must be at most ${MAX_DECK_NAME} characters`);
  const created_at = timestamp(d.created_at, now);
  return {
    id: d.id,
    name,
    main: cardList(d.main, "main"),
    extra: cardList(d.extra, "extra"),
    side: cardList(d.side, "side"),
    file_modified: optDate(d.file_modified, "file_modified"),
    file_created: optDate(d.file_created, "file_created"),
    rarity: cleanRarities(d.rarity),
    sleeve: cleanSleeve(d.sleeve),
    created_at,
    updated_at: keepTimes ? timestamp(d.updated_at, now) : now,
  };
}

interface DeckRow {
  id: string;
  name: string;
  main: string;
  extra: string;
  side: string;
  file_modified: string | null;
  file_created: string | null;
  rarity: string | null;
  sleeve: string | null;
  created_at: string;
  updated_at: string;
}

const rowToDeck = (r: DeckRow): Deck => ({
  id: r.id,
  name: r.name,
  main: JSON.parse(r.main),
  extra: JSON.parse(r.extra),
  side: JSON.parse(r.side),
  file_modified: r.file_modified,
  file_created: r.file_created,
  rarity: r.rarity ? cleanRarities(JSON.parse(r.rarity)) : {},
  sleeve: cleanSleeve(r.sleeve),
  created_at: r.created_at,
  updated_at: r.updated_at,
});

const DECK_SELECT = "SELECT id, name, main, extra, side, file_modified, file_created, rarity, sleeve, created_at, updated_at FROM decks";

/** Multi-row upserts, ≤ 90 bound parameters each. created_at of existing decks is kept. */
function upsertStatements(db: D1Database, userId: string, list: Deck[]): D1PreparedStatement[] {
  const perStmt = Math.floor(MAX_PARAMS / DECK_COLS);
  const out: D1PreparedStatement[] = [];
  for (let i = 0; i < list.length; i += perStmt) {
    const chunk = list.slice(i, i + perStmt);
    const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params = chunk.flatMap((d) => [
      d.id, userId, d.name, JSON.stringify(d.main), JSON.stringify(d.extra), JSON.stringify(d.side),
      d.file_modified ?? null, d.file_created ?? null, d.rarity && Object.keys(d.rarity).length ? JSON.stringify(d.rarity) : null, d.sleeve && d.sleeve !== DEFAULT_SLEEVE ? d.sleeve : null, d.created_at, d.updated_at,
    ]);
    out.push(
      db.prepare(
        `INSERT INTO decks (id, user_id, name, main, extra, side, file_modified, file_created, rarity, sleeve, created_at, updated_at)
         VALUES ${values}
         ON CONFLICT (user_id, id) DO UPDATE SET
           name = excluded.name, main = excluded.main, extra = excluded.extra, side = excluded.side,
           file_modified = excluded.file_modified, file_created = excluded.file_created, rarity = excluded.rarity, sleeve = excluded.sleeve,
           updated_at = excluded.updated_at`,
      ).bind(...params),
    );
  }
  return out;
}

/** How many of `ids` would be new decks, and how many the user already has. */
async function deckQuota(db: D1Database, userId: string, ids: string[]): Promise<{ existing: number; added: number }> {
  const { results } = await db.prepare("SELECT id FROM decks WHERE user_id = ?").bind(userId).all<{ id: string }>();
  const have = new Set(results.map((r) => r.id));
  return { existing: have.size, added: new Set(ids.filter((id) => !have.has(id))).size };
}

export const decks = new Hono<AppEnv>();

decks.use("*", requireUser);
decks.use("*", bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ error: "request too large" }, 413) }));
decks.onError((err, c) => {
  if (err instanceof BadInput) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadInput("body must be JSON");
  }
}

// --- tags (registered before /:id so "tags" is never taken as a deck id) ---

decks.get("/tags", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT card_name, tag FROM user_tags WHERE user_id = ? ORDER BY rowid")
    .bind(c.var.user!.id)
    .all<{ card_name: string; tag: string }>();
  const tags: CustomTags = {};
  for (const r of results) (tags[r.card_name] ??= []).push(r.tag);
  return c.json({ tags });
});

decks.put("/tags", async (c) => {
  const body = (await readJson(c.req.raw)) as { tags?: unknown } | null;
  const raw = body?.tags;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BadInput("tags must be an object of card name -> tags");
  const rows: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [nameRaw, list] of Object.entries(raw as Record<string, unknown>)) {
    const name = nameRaw.trim().toLowerCase();
    if (!name || name.length > MAX_CARD_NAME) throw new BadInput("invalid card name in tags");
    if (!Array.isArray(list)) throw new BadInput(`tags for "${name}" must be an array`);
    if (list.length > MAX_TAGS_PER_CARD) throw new BadInput(`too many tags for "${name}"`);
    for (const t of list) {
      if (typeof t !== "string") throw new BadInput(`tags for "${name}" must be strings`);
      const tag = t.trim();
      if (!tag || tag.length > MAX_TAG_LENGTH) throw new BadInput(`tags must be 1–${MAX_TAG_LENGTH} characters`);
      const k = `${name}\u0000${tag}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push([name, tag]);
    }
  }
  if (rows.length > MAX_TAG_ENTRIES) return c.json({ error: `at most ${MAX_TAG_ENTRIES} tags` }, 413);

  const db = c.env.DB;
  const userId = c.var.user!.id;
  const perStmt = Math.floor(MAX_PARAMS / TAG_COLS);
  const stmts: D1PreparedStatement[] = [db.prepare("DELETE FROM user_tags WHERE user_id = ?").bind(userId)];
  for (let i = 0; i < rows.length; i += perStmt) {
    const chunk = rows.slice(i, i + perStmt);
    stmts.push(
      db.prepare(`INSERT INTO user_tags (user_id, card_name, tag) VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}`)
        .bind(...chunk.flatMap(([n, t]) => [userId, n, t])),
    );
  }
  await db.batch(stmts); // one transaction: replace all or nothing
  return c.json({ ok: true });
});

// --- decks ---

decks.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(`${DECK_SELECT} WHERE user_id = ? ORDER BY name COLLATE NOCASE`)
    .bind(c.var.user!.id)
    .all<DeckRow>();
  return c.json({ decks: results.map(rowToDeck) });
});

decks.post("/bulk", async (c) => {
  const body = (await readJson(c.req.raw)) as { decks?: unknown } | null;
  if (!body || !Array.isArray(body.decks)) throw new BadInput("decks must be an array");
  if (body.decks.length > MAX_BULK) return c.json({ error: `send at most ${MAX_BULK} decks per request` }, 413);
  const now = new Date().toISOString();
  const byId = new Map<string, Deck>();
  body.decks.forEach((raw, i) => {
    try {
      const d = parseDeck(raw, now, true);
      byId.set(d.id, d); // last one wins on duplicate ids
    } catch (e) {
      if (e instanceof BadInput) throw new BadInput(`deck ${i + 1}: ${e.message}`);
      throw e;
    }
  });
  const list = [...byId.values()];
  if (!list.length) return c.json({ count: 0 });

  const db = c.env.DB;
  const userId = c.var.user!.id;
  const { existing, added } = await deckQuota(db, userId, list.map((d) => d.id));
  if (existing + added > MAX_DECKS_PER_USER) {
    return c.json({ error: `accounts can hold at most ${MAX_DECKS_PER_USER} decks (you have ${existing})` }, 413);
  }
  await db.batch(upsertStatements(db, userId, list)); // all-or-nothing
  return c.json({ count: list.length });
});

decks.get("/:id", async (c) => {
  const row = await c.env.DB.prepare(`${DECK_SELECT} WHERE user_id = ? AND id = ?`)
    .bind(c.var.user!.id, c.req.param("id"))
    .first<DeckRow>();
  return row ? c.json({ deck: rowToDeck(row) }) : c.json({ error: "deck not found" }, 404);
});

decks.put("/:id", async (c) => {
  const body = (await readJson(c.req.raw)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") throw new BadInput("deck must be an object");
  const id = c.req.param("id");
  if (body.id !== undefined && body.id !== id) throw new BadInput("deck id does not match the URL");
  const deck = parseDeck({ ...body, id }, new Date().toISOString(), false);

  const db = c.env.DB;
  const userId = c.var.user!.id;
  const { existing, added } = await deckQuota(db, userId, [id]);
  if (added && existing + added > MAX_DECKS_PER_USER) {
    return c.json({ error: `accounts can hold at most ${MAX_DECKS_PER_USER} decks` }, 413);
  }
  await db.batch(upsertStatements(db, userId, [deck]));
  const row = await db.prepare(`${DECK_SELECT} WHERE user_id = ? AND id = ?`).bind(userId, id).first<DeckRow>();
  return c.json({ deck: rowToDeck(row!) });
});

decks.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM decks WHERE user_id = ? AND id = ?").bind(c.var.user!.id, c.req.param("id")).run();
  return c.json({ ok: true });
});
