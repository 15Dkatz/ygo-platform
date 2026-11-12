import { useState } from "react";
import type { ClientMsg, RpsChoice, SessionInfo } from "../../../shared/duel.ts";
import type { Seat } from "../../../shared/duelActions.ts";
import type { Deck } from "../../../shared/types.ts";
import { DeckSelect } from "./DeckPicker.tsx";
import { EngineSupportNote, skillCards, useEngineSupport } from "../engine/EngineSupportNote.tsx";
import "../engine/EngineSupportNote.css";

const RPS: { choice: RpsChoice; label: string; glyph: string }[] = [
  { choice: "rock", label: "Rock", glyph: "✊" },
  { choice: "paper", label: "Paper", glyph: "✋" },
  { choice: "scissors", label: "Scissors", glyph: "✌" },
];

interface Props {
  session: SessionInfo;
  you: Seat | null;
  hasIdentity: boolean;
  decks: Deck[] | null;
  deckId: string;
  setDeckId(id: string): void;
  deck: Deck | null;
  send(m: ClientMsg): void;
}

/** Seats, deck choice, rock-paper-scissors, turn order, rematch. Shown whenever the board is not live. */
export function PreDuel({ session, you, hasIdentity, decks, deckId, setDeckId, deck, send }: Props) {
  const { stage, seats } = session;
  const seated = you !== null;
  const freeSeat = seats.some((s) => s === null);
  const sendDeck = () => deck && send({ t: "join", deckId: deck.id, main: deck.main, extra: deck.extra, side: deck.side });
  const opp = you === null ? null : seats[you === 0 ? 1 : 0];
  // bot opponent (rules-enforced rooms): only the host (seat 0) can seat or remove it
  const [botDeckId, setBotDeckId] = useState("");
  const botDeck = decks?.find((d) => d.id === (botDeckId || deckId)) ?? null;
  const canBot = session.mode === "engine" && you === 0 && (stage === "lobby" || stage === "finished");
  const hasBot = !!seats[1]?.bot;
  const engine = session.mode === "engine";
  const mySkills = skillCards(useEngineSupport(engine ? (deck ? [...deck.main, ...deck.extra, ...deck.side] : null) : null));
  const botSkills = skillCards(useEngineSupport(engine ? (botDeck ? [...botDeck.main, ...botDeck.extra, ...botDeck.side] : null) : null));

  return (
    <div className="duel-preduel">
      <div className="duel-seats">
        {seats.map((s, i) => (
          <div key={i} className={`duel-seat ${you === i ? "is-you" : ""}`}>
            <div className="duel-seat-head">
              <span className={`duel-dot ${s?.connected ? "is-on" : s ? "is-off" : ""}`} />
              <b>{s ? s.name : "Empty seat"}</b>
              {you === i && <span className="duel-chip">you</span>}
            </div>
            <div className="muted">
              {!s ? "Waiting for a player…" : !s.connected ? "Disconnected — seat kept for a few minutes" : s.ready ? `Deck ready (${s.deck?.main}/${s.deck?.extra}/${s.deck?.side})` : "Choosing a deck…"}
            </div>
          </div>
        ))}
      </div>

      {session.engineNotice && (
        <div className="duel-notice">
          <b>Rules-enforced (beta)</b>
          <p>{session.engineNotice}</p>
          {seated && (
            <button className="primary" disabled={session.switchVotes?.[you!]} onClick={() => send({ t: "switchMode", mode: "manual" })}>
              {session.switchVotes?.[you!] ? "Waiting for your opponent…" : "Play this room manually"}
            </button>
          )}
        </div>
      )}

      {(stage === "lobby" || stage === "finished") && (
        <div className="duel-step">
          {stage === "finished" && (
            <div className="duel-result">
              <h2>{session.winner === null ? "Draw" : session.winner === you ? "You win!" : you === null ? `${seats[session.winner]?.name ?? "Player"} wins` : "You lose"}</h2>
              {session.endReason && <p className="muted">{session.endReason}</p>}
            </div>
          )}
          {!hasIdentity ? (
            <p className="muted">Pick a display name in the lobby to take a seat. You are spectating.</p>
          ) : seated || freeSeat ? (
            <div className="duel-deckrow">
              <DeckSelect decks={decks} deckId={deckId} onChange={setDeckId} />
              <button className="primary" disabled={!deck || mySkills.length > 0} onClick={sendDeck}>
                {!seated ? "Take a seat with this deck" : stage === "finished" ? "Use this deck (side deck)" : seats[you!]?.ready ? "Change deck" : "Ready with this deck"}
              </button>
              {session.mode === "engine" && deck && <EngineSupportNote ids={[...deck.main, ...deck.extra, ...deck.side]} />}
            </div>
          ) : (
            <p className="muted">Both seats are taken — you are spectating.</p>
          )}
          {stage === "finished" && seated && (
            <div className="duel-deckrow">
              <button className="primary" disabled={session.rematch[you!] || !opp} onClick={() => send({ t: "rematch" })}>
                {session.rematch[you!] ? "Waiting for opponent…" : "Rematch"}
              </button>
              {opp && session.rematch[you === 0 ? 1 : 0] && <span className="muted">{opp.name} wants a rematch.</span>}
            </div>
          )}
          {stage === "lobby" && seated && !opp && <p className="muted">Share this page's link with your opponent, or wait for someone to join from the lobby.</p>}
          {canBot && !seats[1] && seats[0]?.ready && (
            <div className="duel-bot">
              <b>No opponent yet?</b> <span className="muted">Play against a bot (it plays random legal moves). Its deck:</span>
              <div className="duel-deckrow">
                <DeckSelect decks={decks} deckId={botDeckId || deckId} onChange={setBotDeckId} />
                <button disabled={!botDeck || botSkills.length > 0} onClick={() => botDeck && send({ t: "addBot", deckId: botDeck.id, main: botDeck.main, extra: botDeck.extra, side: botDeck.side })}>
                  Play against a bot
                </button>
                {botDeck && botSkills.length > 0 && <EngineSupportNote ids={[...botDeck.main, ...botDeck.extra, ...botDeck.side]} label="the bot's deck" />}
              </div>
            </div>
          )}
          {canBot && hasBot && stage === "lobby" && (
            <div className="duel-deckrow"><button onClick={() => send({ t: "removeBot" })}>Remove bot</button></div>
          )}
        </div>
      )}

      {stage === "rps" && (
        <div className="duel-step">
          <h2>Rock, paper, scissors</h2>
          {session.rps.last && session.rps.last.winner === null && <p className="muted">Tie ({session.rps.last.choices[0]}) — go again!</p>}
          {seated ? (
            <>
              <div className="duel-rps">
                {RPS.map((r) => (
                  <button key={r.choice} className={session.rps.mine === r.choice ? "is-picked" : ""} disabled={!!session.rps.mine} onClick={() => send({ t: "rps", choice: r.choice })} aria-label={r.label}>
                    <span className="duel-rps-glyph" aria-hidden>{r.glyph}</span>{r.label}
                  </button>
                ))}
              </div>
              <p className="muted">
                {session.rps.mine ? (session.rps.opponentPicked ? "Revealing…" : "Waiting for your opponent…") : session.rps.opponentPicked ? "Your opponent has picked." : "The winner chooses who goes first."}
              </p>
              <button onClick={() => send({ t: "coinToss" })}>Toss a coin instead</button>
            </>
          ) : <p className="muted">The players are deciding who goes first.</p>}
        </div>
      )}

      {stage === "choose" && (
        <div className="duel-step">
          {session.rps.last?.winner != null && <p className="muted">{seats[0]?.name} picked {session.rps.last.choices[0]}, {seats[1]?.name} picked {session.rps.last.choices[1]}.</p>}
          {you !== null && session.chooser === you ? (
            <>
              <h2>Go first or second?</h2>
              <div className="duel-deckrow">
                <button className="primary" onClick={() => send({ t: "chooseOrder", first: true })}>Go first</button>
                <button onClick={() => send({ t: "chooseOrder", first: false })}>Go second</button>
              </div>
            </>
          ) : <p>{session.chooser !== null ? `${seats[session.chooser]?.name} is choosing who goes first…` : "…"}</p>}
        </div>
      )}

      {seated && stage !== "duel" && (
        <button className="duel-leave" onClick={() => send({ t: "leave" })}>Leave seat</button>
      )}
    </div>
  );
}
