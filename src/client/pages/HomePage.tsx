import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.ts";
import { useOptionalAuth } from "../auth.tsx";
import { useDeckStore } from "../store/deckStore.ts";
import type { RoomInfo } from "../../shared/duel.ts";
import type { Deck } from "../../shared/types.ts";
import "./HomePage.css";

/** Landing page: where to go next, at a glance. */
export function HomePage() {
  const auth = useOptionalAuth();
  const store = useDeckStore();
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);

  useEffect(() => {
    let alive = true;
    store.list().then((d) => alive && setDecks(d)).catch(() => alive && setDecks([]));
    return () => { alive = false; };
  }, [store]);
  useEffect(() => {
    let alive = true;
    api<{ rooms: RoomInfo[] }>("/api/rooms").then((r) => alive && setRooms(r.rooms)).catch(() => alive && setRooms([]));
    return () => { alive = false; };
  }, []);

  const name = auth?.user?.username;
  const open = rooms?.filter((r) => r.status === "waiting").length ?? 0;
  const live = rooms?.filter((r) => r.status === "dueling").length ?? 0;
  const recent = decks ? [...decks].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4) : [];

  return (
    <section className="home">
      <div className="home-hero">
        <div className="home-hero-text">
          <h1>{name ? `Welcome back, ${name}` : "It's time to duel"}</h1>
          <p>
            Build decks from your collection, then duel friends online with the official rules enforced by the EDOPro
            engine, or play a free-form manual duel.
          </p>
          <div className="home-cta">
            <Link className="home-btn is-primary" to="/lobby">Duel now</Link>
            {!name && <Link className="home-btn" to="/login">Sign in</Link>}
            {!name && <Link className="home-guest" to="/lobby">or play as a guest</Link>}
          </div>
        </div>
        <div className="home-hero-cards" aria-hidden="true">
          <span className="home-card c1" /><span className="home-card c2" /><span className="home-card c3" />
        </div>
      </div>

      <div className="home-grid">
        <Link to="/lobby" className="home-tile">
          <b>Find a duel</b>
          <span className="muted">
            {rooms === null ? "Checking rooms…" : open ? `${open} room${open === 1 ? "" : "s"} waiting for a player` : "No open rooms: create one or play the bot"}
            {live ? ` · ${live} duel${live === 1 ? "" : "s"} live` : ""}
          </span>
        </Link>
        <Link to="/lobby" className="home-tile">
          <b>Quick duel vs bot</b>
          <span className="muted">Test a deck against a bot, rules enforced</span>
        </Link>
        <Link to="/decks" className="home-tile">
          <b>Build a deck</b>
          <span className="muted">{decks === null ? "…" : decks.length ? `${decks.length} deck${decks.length === 1 ? "" : "s"} saved` : "Import .ydk files or start from scratch"}</span>
        </Link>
        <Link to="/library" className="home-tile">
          <b>Your library</b>
          <span className="muted">Search, tags, tiers and related cards</span>
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="home-recent">
          <h2>Recent decks</h2>
          <div className="home-recent-list">
            {recent.map((d) => (
              <Link key={d.id} to={`/decks/${d.id}`} className="home-deck">
                <b>{d.name}</b>
                <span className="muted">{d.main.length} main · {d.extra.length} extra · {d.side.length} side</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
