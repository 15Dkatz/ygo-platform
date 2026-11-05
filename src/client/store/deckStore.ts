import type { CustomTags, Deck } from "../../shared/types.ts";

/**
 * Where the user's decks and custom tags live.
 * Phase 1 ships `localDeckStore` (browser localStorage, for signed-out use).
 * Phase 2 adds a server-backed store and switches to it when the user is signed in
 * (offering to upload local decks on first sign-in). Pages must only use `useDeckStore()`.
 */
export interface DeckStore {
  list(): Promise<Deck[]>;
  get(id: string): Promise<Deck | null>;
  save(deck: Deck): Promise<Deck>;
  saveMany(decks: Deck[]): Promise<number>;
  remove(id: string): Promise<void>;
  getTags(): Promise<CustomTags>;
  setTags(tags: CustomTags): Promise<void>;
}

const DECKS_KEY = "ygo.decks.v1";
const TAGS_KEY = "ygo.tags.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("could not save to localStorage", e);
    throw new Error("Browser storage is full or blocked. Sign in to save decks to your account.");
  }
}

export const localDeckStore: DeckStore = {
  async list() {
    return read<Deck[]>(DECKS_KEY, []);
  },
  async get(id) {
    return read<Deck[]>(DECKS_KEY, []).find((d) => d.id === id) ?? null;
  },
  async save(deck) {
    const all = read<Deck[]>(DECKS_KEY, []).filter((d) => d.id !== deck.id);
    const saved = { ...deck, updated_at: new Date().toISOString() };
    write(DECKS_KEY, [...all, saved]);
    return saved;
  },
  async saveMany(decks) {
    const ids = new Set(decks.map((d) => d.id));
    write(DECKS_KEY, [...read<Deck[]>(DECKS_KEY, []).filter((d) => !ids.has(d.id)), ...decks]);
    return decks.length;
  },
  async remove(id) {
    write(DECKS_KEY, read<Deck[]>(DECKS_KEY, []).filter((d) => d.id !== id));
  },
  async getTags() {
    return read<CustomTags>(TAGS_KEY, {});
  },
  async setTags(tags) {
    write(TAGS_KEY, tags);
  },
};

/** Phase 2 replaces the body of this hook to return the server store when signed in. */
export function useDeckStore(): DeckStore {
  return localDeckStore;
}

export function newDeck(name: string, partial: Partial<Deck> = {}): Deck {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name, main: [], extra: [], side: [], created_at: now, updated_at: now, ...partial };
}
