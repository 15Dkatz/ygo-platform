import type { Card } from "../shared/types.ts";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const res = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || res.statusText);
  return data as T;
}

/** Image URL served (and edge-cached) by our Worker. */
export const cardImage = (id: number, size: "small" | "full" | "crop" = "small") => `/img/${size}/${id}.jpg`;

export interface LookupResult {
  cards: Card[];
  alias: Record<number, number>;
  missing: number[];
}

/** Resolve raw .ydk ids to catalogue cards (batched to keep requests small). */
export async function lookupCards(ids: number[]): Promise<LookupResult> {
  const out: LookupResult = { cards: [], alias: {}, missing: [] };
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 2000) {
    const r = await api<LookupResult>("/api/cards/lookup", { method: "POST", json: { ids: unique.slice(i, i + 2000) } });
    out.cards.push(...r.cards);
    Object.assign(out.alias, r.alias);
    out.missing.push(...r.missing);
  }
  return out;
}

export interface SearchResult {
  cards: Card[];
  total: number;
}

export function searchCards(params: Record<string, string | number | undefined>): Promise<SearchResult> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  return api<SearchResult>(`/api/cards/search?${qs}`);
}

export interface Facets {
  kind: string[];
  attribute: string[];
  race: string[];
  archetype: string[];
  imported_at: string | null;
}

export const getFacets = () => api<Facets>("/api/cards/facets");
