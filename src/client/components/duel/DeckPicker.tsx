import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useDeckStore } from "../../store/deckStore.ts";
import { validateDeck } from "../../../shared/duelActions.ts";
import type { Deck } from "../../../shared/types.ts";
import { STARTER_DECKS, isStarterDeck } from "../../../shared/starterDecks.ts";

const LAST_DECK = "ygo.duel.lastDeck";

export function rememberDeck(id: string) {
  try { localStorage.setItem(LAST_DECK, id); } catch { /* storage blocked */ }
}
export function lastDeckId(): string | null {
  try { return localStorage.getItem(LAST_DECK); } catch { return null; }
}

/** Sleeves picked in a duel room for decks you can't save (starter decks): deck id -> sleeve. */
const SLEEVES = "ygo.duel.sleeves";
function sleeveOverrides(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SLEEVES) ?? "{}") ?? {}; } catch { return {}; }
}

/** Load the user's decks (through the deck store) plus the built-in starter decks, and keep the chosen one.
 *  Someone with no legal deck of their own (a guest, a new player) gets a starter deck picked for them. */
export function useDecks() {
  const store = useDeckStore();
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [deckId, setDeckIdState] = useState<string>(lastDeckId() ?? "");
  useEffect(() => {
    store.list().then((list) => {
      const sorted = [...[...list].sort((a, b) => a.name.localeCompare(b.name)), ...STARTER_DECKS];
      setDecks(sorted);
      setDeckIdState((cur) => (sorted.some((d) => d.id === cur) ? cur : sorted.find((d) => !validateDeck(d))?.id ?? ""));
    }).catch(() => {
      setDecks(STARTER_DECKS);
      setDeckIdState((cur) => (STARTER_DECKS.some((d) => d.id === cur) ? cur : STARTER_DECKS[0].id));
    });
    // load once per mount (the store object may be recreated on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setDeckId = (id: string) => { setDeckIdState(id); rememberDeck(id); };
  const [overrides, setOverrides] = useState(sleeveOverrides);
  const shown = useMemo(() => decks && decks.map((d) => (overrides[d.id] ? { ...d, sleeve: overrides[d.id] } : d)), [decks, overrides]);
  const deck = shown?.find((d) => d.id === deckId) ?? null;
  /** Change a deck's sleeve from the duel room: your own decks are saved with it; starter decks remember it here. */
  const setSleeve = async (id: string, sleeve: string) => {
    const d = decks?.find((x) => x.id === id);
    if (!d) return;
    if (isStarterDeck(id)) {
      const next = { ...overrides, [id]: sleeve };
      setOverrides(next);
      try { localStorage.setItem(SLEEVES, JSON.stringify(next)); } catch { /* storage blocked */ }
      return;
    }
    const updated = { ...d, sleeve };
    setDecks((list) => list?.map((x) => (x.id === id ? updated : x)) ?? list);
    await store.save(updated);
  };
  /** A deck was created or saved elsewhere (the duel page's deck editor): show it in the list. */
  const upsertDeck = (d: Deck) => setDecks((list) => {
    if (!list) return [d];
    if (list.some((x) => x.id === d.id)) return list.map((x) => (x.id === d.id ? d : x));
    const own = [...list.filter((x) => !isStarterDeck(x.id)), d].sort((a, b) => a.name.localeCompare(b.name));
    return [...own, ...list.filter((x) => isStarterDeck(x.id))];
  });
  return { decks: shown, deck, deckId, setDeckId, setSleeve, upsertDeck };
}

export function DeckSelect({ decks, deckId, onChange }: { decks: Deck[] | null; deckId: string; onChange(id: string): void }) {
  if (decks === null) return <span className="muted">Loading decks…</span>;
  if (!decks.length) return <span className="muted">You have no decks yet — <Link to="/decks">import or build one</Link>.</span>;
  const own = decks.filter((d) => !isStarterDeck(d.id)), starters = decks.filter((d) => isStarterDeck(d.id));
  const opt = (d: Deck) => {
    const bad = validateDeck(d);
    return <option key={d.id} value={d.id}>{d.name} ({d.main.length}/{d.extra.length}/{d.side.length}){bad ? " — not legal" : ""}</option>;
  };
  const chosen = decks.find((d) => d.id === deckId);
  const err = chosen ? validateDeck(chosen) : null;
  return (
    <span className="duel-deckselect">
      <select value={deckId} onChange={(e) => onChange(e.target.value)} aria-label="Deck">
        <option value="" disabled>Choose a deck…</option>
        {own.length > 0 && <optgroup label="Your decks">{own.map(opt)}</optgroup>}
        <optgroup label="Starter decks">{starters.map(opt)}</optgroup>
      </select>
      {err && <span className="duel-error-text">{err}</span>}
      {!own.length && <small className="muted">No decks of your own yet: a starter deck is ready, or <Link to="/decks">import or build one</Link>.</small>}
    </span>
  );
}

/** Ask a guest for a display name (stored in the ygo_guest cookie by the server). */
export function NameForm({ onSave, initial = "", compact }: { onSave(name: string): Promise<unknown>; initial?: string; compact?: boolean }) {
  const [name, setName] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try { await onSave(name); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <form className={`duel-nameform ${compact ? "is-compact" : ""}`} onSubmit={submit}>
      <label>
        <span>Display name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Yugi" required />
      </label>
      <button className="primary" disabled={busy || !name.trim()}>{initial ? "Rename" : "Continue as guest"}</button>
      {err && <span className="duel-error-text">{err}</span>}
    </form>
  );
}
