import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useDeckStore } from "../../store/deckStore.ts";
import { validateDeck } from "../../../shared/duelActions.ts";
import type { Deck } from "../../../shared/types.ts";

const LAST_DECK = "ygo.duel.lastDeck";

export function rememberDeck(id: string) {
  try { localStorage.setItem(LAST_DECK, id); } catch { /* storage blocked */ }
}
export function lastDeckId(): string | null {
  try { return localStorage.getItem(LAST_DECK); } catch { return null; }
}

/** Load the user's decks (through the deck store) and keep the chosen one. */
export function useDecks() {
  const store = useDeckStore();
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [deckId, setDeckIdState] = useState<string>(lastDeckId() ?? "");
  useEffect(() => {
    store.list().then((list) => {
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
      setDecks(sorted);
      setDeckIdState((cur) => (sorted.some((d) => d.id === cur) ? cur : sorted.find((d) => !validateDeck(d))?.id ?? ""));
    }).catch(() => setDecks([]));
    // load once per mount (the store object may be recreated on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setDeckId = (id: string) => { setDeckIdState(id); rememberDeck(id); };
  const deck = decks?.find((d) => d.id === deckId) ?? null;
  return { decks, deck, deckId, setDeckId };
}

export function DeckSelect({ decks, deckId, onChange }: { decks: Deck[] | null; deckId: string; onChange(id: string): void }) {
  if (decks === null) return <span className="muted">Loading decks…</span>;
  if (!decks.length) return <span className="muted">You have no decks yet — <Link to="/decks">import or build one</Link>.</span>;
  const chosen = decks.find((d) => d.id === deckId);
  const err = chosen ? validateDeck(chosen) : null;
  return (
    <span className="duel-deckselect">
      <select value={deckId} onChange={(e) => onChange(e.target.value)} aria-label="Deck">
        <option value="" disabled>Choose a deck…</option>
        {decks.map((d) => {
          const bad = validateDeck(d);
          return <option key={d.id} value={d.id}>{d.name} ({d.main.length}/{d.extra.length}/{d.side.length}){bad ? " — not legal" : ""}</option>;
        })}
      </select>
      {err && <span className="duel-error-text">{err}</span>}
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
