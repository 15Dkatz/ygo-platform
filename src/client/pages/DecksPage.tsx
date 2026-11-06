// PHASE 1 owns this page (deck list, import .ydk, new deck).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Deck } from "../../shared/types.ts";
import { toYdk } from "../../shared/ydk.ts";
import { parseYdke } from "../../shared/ydke.ts";
import { newDeck, useDeckStore } from "../store/deckStore.ts";
import { useOptionalAuth } from "../auth.tsx";
import { downloadText, safeFileName } from "../components/cards/cardInfo.ts";
import { ImportDecks } from "../components/library/ImportDecks.tsx";
import "./DecksPage.css";

type SortBy = "name" | "date" | "updated" | "size";

export function DecksPage() {
  const store = useDeckStore();
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const guest = !!auth && !auth.loading && !auth.user;
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDecks(await store.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [store]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const on = () => void load();
    window.addEventListener("ygo:decks-changed", on);
    return () => window.removeEventListener("ygo:decks-changed", on);
  }, [load]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = (decks || []).filter((d) => words.every((w) => d.name.toLowerCase().includes(w)));
    const date = (d: Deck) => d.file_modified || d.updated_at.slice(0, 10);
    const cmp: Record<SortBy, (a: Deck, b: Deck) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      date: (a, b) => date(b).localeCompare(date(a)),
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
      size: (a, b) => b.main.length + b.extra.length + b.side.length - (a.main.length + a.extra.length + a.side.length),
    };
    return list.sort((a, b) => cmp[sortBy](a, b) || a.name.localeCompare(b.name));
  }, [decks, q, sortBy]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const create = () =>
    run(async () => {
      const taken = new Set((decks || []).map((d) => d.name));
      let name = "New deck", i = 2;
      while (taken.has(name)) name = `New deck ${i++}`;
      const d = await store.save(newDeck(name));
      navigate(`/decks/${d.id}`);
    });
  const duplicate = (d: Deck) =>
    run(async () => {
      const taken = new Set((decks || []).map((x) => x.name));
      let name = `${d.name} (copy)`, i = 2;
      while (taken.has(name)) name = `${d.name} (copy ${i++})`;
      await store.save(newDeck(name, { main: [...d.main], extra: [...d.extra], side: [...d.side] }));
    });
  const importYdke = () =>
    run(async () => {
      const link = window.prompt("Paste a ydke:// deck link (from EDOPro, YGOPRODeck, Discord…):");
      if (!link) return;
      const lists = parseYdke(link);
      const taken = new Set((decks || []).map((x) => x.name));
      let name = "Imported deck", i = 2;
      while (taken.has(name)) name = `Imported deck ${i++}`;
      const d = await store.save(newDeck(name, lists));
      navigate(`/decks/${d.id}`);
    });
  const remove = (d: Deck) => {
    if (window.confirm(`Delete the deck “${d.name}”? This cannot be undone.`)) void run(() => store.remove(d.id));
  };

  return (
    <section className="decks-page">
      <div className="decks-head">
        <h1>Decks {decks && <span className="muted decks-sub">· {decks.length}</span>}</h1>
        <span className="decks-head-actions">
          <button type="button" onClick={() => void importYdke()} title="Create a deck from a ydke:// link">Import YDKe</button>
          <button type="button" className="primary" onClick={() => void create()}>New deck</button>
        </span>
      </div>
      {guest && (
        <p className="decks-guest" role="note">
          You're playing as a guest: your decks are saved <b>in this browser</b> and work in the lobby and duels.
          {" "}<Link to="/login?next=/decks">Create a free account</Link> to keep them on every device. We'll offer to upload these then.
        </p>
      )}
      <ImportDecks onImported={() => void load()} />
      {error && <p className="decks-error" role="alert">{error}</p>}
      {decks && decks.length > 0 && (
        <div className="decks-tools">
          <input type="search" placeholder="Search decks…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search decks" />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} aria-label="Sort decks">
            <option value="name">Name</option>
            <option value="date">Deck date (newest)</option>
            <option value="updated">Last edited</option>
            <option value="size">Size</option>
          </select>
          <span className="muted">{shown.length} shown</span>
        </div>
      )}
      {!decks ? (
        <p className="muted">Loading…</p>
      ) : decks.length === 0 ? (
        <p className="muted">No decks yet. Import your .ydk files or start a new deck.</p>
      ) : (
        <ul className="deck-list">
          {shown.map((d) => (
            <li key={d.id} className="deck-item">
              <Link to={`/decks/${d.id}`} className="deck-name">{d.name}</Link>
              <span className="deck-counts">
                <span title="Main Deck" className={d.main.length < 40 || d.main.length > 60 ? "bad" : ""}>Main {d.main.length}</span>
                <span title="Extra Deck" className={d.extra.length > 15 ? "bad" : ""}>Extra {d.extra.length}</span>
                <span title="Side Deck" className={d.side.length > 15 ? "bad" : ""}>Side {d.side.length}</span>
              </span>
              <span className="muted deck-date" title={d.file_modified ? "File date" : "Last edited"}>
                {d.file_modified || d.updated_at.slice(0, 10)}
              </span>
              <span className="deck-actions">
                <Link to={`/decks/${d.id}`} className="btn">Open</Link>
                <button type="button" onClick={() => void duplicate(d)}>Duplicate</button>
                <button type="button" onClick={() => downloadText(`${safeFileName(d.name)}.ydk`, toYdk(d))}>Export .ydk</button>
                <button type="button" className="danger" onClick={() => remove(d)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
