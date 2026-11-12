// PHASE 3 owns this page (room list, create room with Manual / Rules-enforced toggle).
import { demoDeck } from "../../shared/starterDecks.ts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import type { RoomInfo } from "../../shared/duel.ts";
import type { DuelMode } from "../../shared/types.ts";
import { DEFAULT_SETTINGS, LP_CHOICES, TIMER_CHOICES, cleanSettings, formatTimer, type RoomSettings } from "../../shared/roomSettings.ts";
import { DeckSelect, NameForm, useDecks } from "../components/duel/DeckPicker.tsx";
import { useDuelIdentity } from "../components/duel/useDuel.ts";
import { EngineSupportNote, skillCards, useEngineSupport } from "../components/engine/EngineSupportNote.tsx";
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
  // room settings, remembered for next time
  const [settings, setSettingsState] = useState<RoomSettings>(() => {
    try { return cleanSettings(JSON.parse(localStorage.getItem("ygo.roomSettings") ?? "null") ?? DEFAULT_SETTINGS); } catch { return DEFAULT_SETTINGS; }
  });
  const setSetting = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => setSettingsState((cur) => {
    const next = { ...cur, [k]: v };
    try { localStorage.setItem("ygo.roomSettings", JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  // quick duel vs a bot: the bot's deck ("" = same as yours)
  const [botDeckId, setBotDeckId] = useState(() => { try { return localStorage.getItem("ygo.botDeck") ?? ""; } catch { return ""; } });
  const botDeck = decks?.find((d) => d.id === botDeckId) ?? deck;
  const pickBotDeck = (id: string) => { setBotDeckId(id); try { localStorage.setItem("ygo.botDeck", id); } catch { /* private mode */ } };
  // Skill cards block rules-enforced duels (yours and the bot's deck)
  const mySkills = skillCards(useEngineSupport(deck ? [...deck.main, ...deck.extra, ...deck.side] : null));
  const botSkills = skillCards(useEngineSupport(botDeck ? [...botDeck.main, ...botDeck.extra, ...botDeck.side] : null));
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickErr, setQuickErr] = useState<string | null>(null);

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
      const r = await api<{ roomId: string }>("/api/rooms", { method: "POST", json: { mode, name: roomName.trim() || undefined, settings } });
      navigate(`/duel/${r.roomId}?join=1`);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  /** Demo: Synchro Warriors (you, on autopilot) vs a bot on Rank 4 Xyz, to watch a whole duel. */
  const demoDuel = async () => {
    if (!identity) return;
    const bot = demoDeck("xyz");
    setQuickBusy(true);
    setQuickErr(null);
    try {
      const r = await api<{ roomId: string }>("/api/rooms", {
        method: "POST",
        json: { mode: "engine", name: "Demo duel", demo: true, bot: { deckId: bot.id, main: bot.main, extra: bot.extra, side: bot.side } },
      });
      navigate(`/duel/${r.roomId}?join=1&autopilot=1&demo=1`);   // joins with the Synchro demo deck
    } catch (x) {
      setQuickErr((x as Error).message);
      setQuickBusy(false);
    }
  };

  const quickDuel = async () => {
    if (!botDeck || !identity) return;
    setQuickBusy(true);
    setQuickErr(null);
    try {
      const r = await api<{ roomId: string }>("/api/rooms", {
        method: "POST",
        json: { mode: "engine", name: `${identity.name} vs Bot`, bot: { deckId: botDeck.id, main: botDeck.main, extra: botDeck.extra, side: botDeck.side } },
      });
      navigate(`/duel/${r.roomId}?join=1`);
    } catch (x) {
      setQuickErr((x as Error).message);
      setQuickBusy(false);
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

        <div className="lobby-card lobby-quick">
          <h2>Quick duel vs bot</h2>
          <p className="muted">Jump straight into a rules-enforced duel against a bot that plays random legal moves. Good for testing a deck.</p>
          <div className="lobby-field">
            <span>Bot's deck</span>
            <select value={botDeckId} onChange={(e) => pickBotDeck(e.target.value)} aria-label="Bot's deck" disabled={!decks?.length}>
              <option value="">Same as mine</option>
              {decks?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {deck && mySkills.length > 0 && <EngineSupportNote ids={[...deck.main, ...deck.extra, ...deck.side]} label="your deck" />}
          {botDeck && botDeck !== deck && botSkills.length > 0 && <EngineSupportNote ids={[...botDeck.main, ...botDeck.extra, ...botDeck.side]} label="the bot's deck" />}
          <button className="primary" disabled={quickBusy || !identity || !deck || !botDeck || mySkills.length > 0 || botSkills.length > 0} onClick={quickDuel}>
            {quickBusy ? "Starting…" : "Play vs bot"}
          </button>
          <button disabled={quickBusy || !identity} onClick={demoDuel}
            title="Both sides play themselves (Synchro Warriors vs Rank 4 Xyz) so you can watch the animations. Speed and Autopilot can be changed in the duel.">
            ▶ Watch a demo duel
          </button>
          {!deck && identity && <small className="muted">Choose your deck first.</small>}
          {quickErr && <small className="lobby-error">{quickErr}</small>}
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
          <details className="lobby-settings">
            <summary>Room settings <span className="muted">· {formatTimer(settings.turnTimerSec)} · {settings.startingLP} LP · {settings.visibility === "public" ? "public" : "unlisted"}{settings.spectators ? "" : " · no spectators"}</span></summary>
            <div className="lobby-settings-grid">
              <label className="lobby-field">
                <span>Turn timer</span>
                <select value={settings.turnTimerSec} onChange={(e) => setSetting("turnTimerSec", Number(e.target.value))}>
                  {TIMER_CHOICES.map((t) => <option key={t} value={t}>{t ? `${formatTimer(t)} per turn` : "No timer"}</option>)}
                </select>
                <small className="muted">Your clock only runs while the duel waits on you. Running out loses the duel.</small>
              </label>
              <label className="lobby-field">
                <span>Starting LP</span>
                <select value={settings.startingLP} onChange={(e) => setSetting("startingLP", Number(e.target.value))}>
                  {LP_CHOICES.map((lp) => <option key={lp} value={lp}>{lp.toLocaleString()}</option>)}
                </select>
              </label>
              <label className="lobby-field">
                <span>Who can find it</span>
                <select value={settings.visibility} onChange={(e) => setSetting("visibility", e.target.value === "unlisted" ? "unlisted" : "public")}>
                  <option value="public">Public: listed in the lobby</option>
                  <option value="unlisted">Unlisted: only people with the link</option>
                </select>
              </label>
              <label className="lobby-check">
                <input type="checkbox" checked={settings.spectators} onChange={(e) => setSetting("spectators", e.target.checked)} />
                Allow spectators
              </label>
            </div>
          </details>
          {mode === "engine" && deck && <EngineSupportNote ids={[...deck.main, ...deck.extra, ...deck.side]} />}
          <button className="primary" disabled={busy || !identity || !deck || (mode === "engine" && mySkills.length > 0)}>{busy ? "Creating…" : "Create and sit down"}</button>
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
                    {r.settings?.turnTimerSec ? <span className="lobby-chip" title="Turn timer">⏱ {formatTimer(r.settings.turnTimerSec)}</span> : null}
                    {r.settings && r.settings.startingLP !== 8000 ? <span className="lobby-chip">{r.settings.startingLP} LP</span> : null}
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
