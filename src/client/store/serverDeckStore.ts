import type { CustomTags, Deck } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { whenAuthKnown } from "../auth.tsx";
import type { DeckStore } from "./deckStore.ts";

// PHASE 2: decks and tags saved to the signed-in user's account (see src/worker/routes/decks.ts).

/** Decks per /api/decks/bulk request (server accepts up to 500; keep bodies modest). */
const BULK_CHUNK = 200;

/** Fired on window after decks/tags change outside the page that made the change
 *  (e.g. local decks uploaded on first sign-in). Pages may listen and reload. */
export const DECKS_CHANGED_EVENT = "ygo:decks-changed";

const enc = encodeURIComponent;

export const serverDeckStore: DeckStore = {
  async list() {
    return (await api<{ decks: Deck[] }>("/api/decks")).decks;
  },
  async get(id) {
    try {
      return (await api<{ deck: Deck }>(`/api/decks/${enc(id)}`)).deck;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  async save(deck) {
    return (await api<{ deck: Deck }>(`/api/decks/${enc(deck.id)}`, { method: "PUT", json: deck })).deck;
  },
  async saveMany(decks) {
    let count = 0;
    for (let i = 0; i < decks.length; i += BULK_CHUNK) {
      const r = await api<{ count: number }>("/api/decks/bulk", { method: "POST", json: { decks: decks.slice(i, i + BULK_CHUNK) } });
      count += r.count;
    }
    return count;
  },
  async remove(id) {
    await api(`/api/decks/${enc(id)}`, { method: "DELETE" });
  },
  async getTags() {
    return (await api<{ tags: CustomTags }>("/api/decks/tags")).tags;
  },
  async setTags(tags) {
    await api("/api/decks/tags", { method: "PUT", json: { tags } });
  },
};

let pending: DeckStore | null = null;
/** Store used while we don't yet know whether anyone is signed in: every call waits for
 *  the first /api/auth/me answer, then goes to the server or local store. */
export function authPendingStore(local: DeckStore): DeckStore {
  const pick = async () => ((await whenAuthKnown()) ? serverDeckStore : local);
  return (pending ??= {
    list: async () => (await pick()).list(),
    get: async (id) => (await pick()).get(id),
    save: async (d) => (await pick()).save(d),
    saveMany: async (d) => (await pick()).saveMany(d),
    remove: async (id) => (await pick()).remove(id),
    getTags: async () => (await pick()).getTags(),
    setTags: async (t) => (await pick()).setTags(t),
  });
}

/** Merge two tag maps (union, order kept). */
export function mergeTags(a: CustomTags, b: CustomTags): CustomTags {
  const out: CustomTags = {};
  for (const src of [a, b]) {
    for (const [name, tags] of Object.entries(src)) {
      const key = name.toLowerCase();
      out[key] = [...new Set([...(out[key] ?? []), ...tags])];
    }
  }
  return out;
}

/** Copy local decks + tags into the account, then clear the local copies. */
export async function uploadLocalData(local: DeckStore): Promise<{ decks: number; tags: number }> {
  const [decks, localTags] = await Promise.all([local.list(), local.getTags()]);
  if (decks.length) await serverDeckStore.saveMany(decks);
  const tagCount = Object.keys(localTags).length;
  if (tagCount) await serverDeckStore.setTags(mergeTags(await serverDeckStore.getTags(), localTags));
  // only clear after everything above succeeded
  for (const d of decks) await local.remove(d.id);
  if (tagCount) await local.setTags({});
  window.dispatchEvent(new Event(DECKS_CHANGED_EVENT));
  return { decks: decks.length, tags: tagCount };
}

export async function hasLocalData(local: DeckStore): Promise<{ decks: number; tags: number }> {
  const [decks, tags] = await Promise.all([local.list(), local.getTags()]);
  return { decks: decks.length, tags: Object.keys(tags).length };
}
