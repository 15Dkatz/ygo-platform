import type { Card } from "../../../shared/types.ts";
import { api, type LookupResult } from "../../api.ts";

/**
 * In-memory cache of catalogue cards resolved through /api/cards/lookup, shared by every
 * page (library, deck builder, duel UI). Ids are fetched once per page load.
 */
const cards = new Map<number, Card>();
const alias = new Map<number, number>(); // raw id -> canonical id
const missing = new Set<number>();
let version = 0;

export const catalog = {
  cards: cards as ReadonlyMap<number, Card>,
  alias: alias as ReadonlyMap<number, number>,
  missing: missing as ReadonlySet<number>,
  /** Bumped whenever new cards arrive (handy as a memo dependency). */
  get version() {
    return version;
  },
  /** Canonical id for a raw .ydk id (or the id itself when unknown). */
  resolve(id: number): number {
    return alias.get(id) ?? id;
  },
  get(id: number): Card | undefined {
    return cards.get(alias.get(id) ?? id);
  },
  /** Remember cards that came from another endpoint (e.g. search results). */
  remember(list: Card[]) {
    for (const c of list) {
      if (!cards.has(c.id)) version++;
      cards.set(c.id, c);
      alias.set(c.id, c.id);
    }
  },
};

const CHUNK = 2000;

/**
 * Make sure every id is resolved (alias -> canonical card, or marked missing).
 * `onProgress(done, total)` is called after each request.
 */
export async function ensureCards(ids: Iterable<number>, onProgress?: (done: number, total: number) => void, options: { signal?: AbortSignal; batchSize?: number } = {}): Promise<void> {
  const todo = [...new Set(ids)].filter((id) => !alias.has(id) && !missing.has(id));
  onProgress?.(0, todo.length);
  const batch = options.batchSize ?? CHUNK;
  for (let i = 0; i < todo.length; i += batch) {
    options.signal?.throwIfAborted();
    const chunk = todo.slice(i, i + batch);
    const r = await api<LookupResult>("/api/cards/lookup", { method: "POST", json: { ids: chunk }, signal: options.signal });
    for (const c of r.cards) cards.set(c.id, c);
    for (const [raw, canon] of Object.entries(r.alias)) alias.set(Number(raw), canon);
    for (const id of r.missing) missing.add(id);
    version++;
    onProgress?.(Math.min(todo.length, i + batch), todo.length);
  }
}
