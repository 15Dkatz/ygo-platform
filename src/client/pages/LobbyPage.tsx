// PHASE 3 owns this page (room list, create room with Manual / Rules-enforced toggle).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import type { RoomInfo } from "../../shared/duel.ts";
import type { DuelMode } from "../../shared/types.ts";
import { DeckSelect, NameForm, useDecks } from "../components/duel/DeckPicker.tsx";
import { useDuelIdentity } from "../components/duel/useDuel.ts";
import { EngineSupportNote } from "../components/engine/EngineSupportNote.tsx";
import "../components/engine/EngineSupportNote.css";
import "./LobbyPage.css";

const REFRESH_MS = 5000;

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

export function LobbyPage() {
  const navigate = useNavigate();
  const { identity, requireAccount, loading, setName } = useDuelIdentity();
  const { decks, deck, deckId, setDeckId } = useDecks();
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [mode, setMode] = useState<DuelMode>("engine");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ rooms: RoomInfo[] }>("/api/rooms");
      setRooms(r.rooms);
      setListErr(null);
    } catch (e) {
      setListErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ roomId: string }>("/api/rooms", { method: "POST", json: { mode, name: roomName.trim() || undefined } });
      navigate(`/duel/${r.roomId}?join=1`);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="lobby">
      <h1>Duel lobby</h1>

      <div className="lobby-grid">
        <div className="lobby-card">
          <h2>You</h2>
          {loading ? <p className="muted">Loading…</p> : identity && !renaming ? (
            <p>
              Dueling as <b>{identity.name}</b>{identity.guest ? <span className="muted"> (guest)</span> : null}
              {identity.guest && <button className="lobby-link" onClick={() => setRenaming(true)}>change name</button>}
            </p>
          ) : requireAccount ? (
            <p><Link to="/login">Sign in</Link> to duel.</p>
          ) : (
            <>
              {!identity && <p className="muted">Pick a name to duel as a guest, or <Link to="/login">sign in</Link>.</p>}
              <NameForm initial={identity?.name} onSave={async (n) => { await setName(n); setRenaming(false); }} />
            </>
          )}
          <div className="lobby-field">
            <span>Deck</span>
            <DeckSelect decks={decks} deckId={deckId} onChange={setDeckId} />
          </div>
        </div>

        <form className="lobby-card" onSubmit={create}>
          <h2>Create a room</h2>
          <label className="lobby-field">
            <span>Room name</span>
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={40} placeholder={identity ? `${identity.name}'s room` : "My room"} />
          </label>
          <div className="lobby-field">
            <span>Mode</span>
            <div className="lobby-seg" role="radiogroup" aria-label="Mode">
              <button type="button" role="radio" aria-checked={mode === "engine"} className={mode === "engine" ? "is-active" : ""} onClick={() => setMode("engine")}>
                Rules-enforced
              </button>
              <button type="button" role="radio" aria-checked={mode === "manual"} className={mode === "manual" ? "is-active" : ""} onClick={() => setMode("manual")}>
                Manual
              </button>
            </div>
            <small className="muted">
              {mode === "manual" ? "A virtual table: you move your own cards, the server only keeps the board in sync." : "The official rules are enforced (EDOPro engine): you pick from legal moves only. Both players can agree to switch to manual mid-duel."}
            </small>
          </div>
          {mode === "engine" && deck && <EngineSupportNote ids={[...deck.main, ...deck.extra, ...deck.side]} />}
          <button className="primary" disabled={busy || !identity || !deck}>{busy ? "Creating…" : "Create and sit down"}</button>
          {!deck && identity && <small className="muted">Choose a deck first.</small>}
          {err && <small className="lobby-error">{err}</small>}
        </form>
      </div>

      <div className="lobby-rooms">
        <div className="lobby-rooms-head">
          <h2>Rooms</h2>
          <button onClick={refresh} className="lobby-link">Refresh</button>
        </div>
        {listErr && <p className="lobby-error">Could not load rooms: {listErr}</p>}
        {rooms === null ? <p className="muted">Loading rooms…</p> : rooms.length === 0 ? (
          <p className="muted">No open rooms. Create one!</p>
        ) : (
          <ul className="lobby-list">
            {rooms.map((r) => {
              const open = r.status === "waiting" && r.players.length < 2;
              return (
                <li key={r.roomId} className="lobby-room">
                  <div className="lobby-room-main">
                    <b>{r.name}</b>
                    <span className={`lobby-chip ${r.mode === "engine" ? "is-beta" : ""}`}>{r.mode === "engine" ? "Rules" : "Manual"}</span>
                    <span className={`lobby-chip is-${r.status}`}>{open ? "Open" : r.status === "dueling" ? "Dueling" : r.status}</span>
                  </div>
                  <div className="muted lobby-room-meta">
                    {r.players.length ? r.players.join(" vs ") : `Host: ${r.host}`} · {ago(r.created_at)}{r.spectators ? ` · ${r.spectators} watching` : ""}
                  </div>
                  <div className="lobby-room-actions">
                    {open && <button className="primary" disabled={!identity || !deck} onClick={() => navigate(`/duel/${r.roomId}?join=1`)}>Join</button>}
                    <button onClick={() => navigate(`/duel/${r.roomId}`)}>Spectate</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
