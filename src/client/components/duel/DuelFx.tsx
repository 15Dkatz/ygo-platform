// Duel "moments": turn banner + phase ribbon, the end-of-duel overlay, the reconnecting
// overlay and the sound toggle. Pure presentation; the page decides when they show.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import type { BoardState, SessionInfo } from "../../../shared/duel.ts";
import { PHASE_LABEL, type Seat } from "../../../shared/duelActions.ts";
import { isMuted, onMuteChange, play, setMuted } from "./anim/sfx.ts";

const PHASE_GLYPH: Record<string, string> = { main1: "✦", battle: "⚔", main2: "✧", end: "☾", draw: "⇣", standby: "◇" };

/** A full-width sweep across the board at each new turn ("YOUR TURN") and each phase change
 *  ("BATTLE PHASE"): a slanted band in the phase's colour, a light streak, huge letters, a flash. */
export function TurnBanner({ board, you }: { board: BoardState; you: Seat | null }) {
  const [shown, setShown] = useState<{ key: string; big: string; small: string; mine: boolean; phase: string; turn: boolean } | null>(null);
  const last = useRef<{ turn: number; phase: string } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = { turn: board.turn, phase: board.phase };
    if (!prev) return;   // first board after (re)connecting: no fanfare
    const mine = board.turnPlayer === you;
    const name = board.players[board.turnPlayer].name;
    const who = you === null ? `${name}'s turn` : mine ? "Your turn" : `${name}'s turn`;
    if (board.turn !== prev.turn) {
      setShown({ key: `t${board.turn}`, big: who, small: `Turn ${board.turn}`, mine, phase: "turn", turn: true });
      play("turn");
    } else if (board.phase !== prev.phase && board.phase !== "draw" && board.phase !== "standby") {
      setShown({ key: `p${board.turn}${board.phase}`, big: PHASE_LABEL[board.phase], small: `Turn ${board.turn} · ${who}`, mine, phase: board.phase, turn: false });
      if (board.phase === "battle") play("attack"); else play("pick");
    } else return;
    const t = setTimeout(() => setShown(null), board.turn !== prev.turn ? 1700 : 1350);
    return () => clearTimeout(t);
  }, [board.turn, board.phase, board.turnPlayer, board.players, you]);
  if (!shown) return null;
  return (
    <div key={shown.key} className={`duel-phasefx ph-${shown.phase} ${shown.turn ? "is-turn" : "is-phase"} ${shown.mine ? "is-mine" : "is-theirs"}`} aria-live="polite">
      <div className="duel-phasefx-band">
        <div className="duel-phasefx-inner">
          {!shown.turn && <span className="duel-phasefx-glyph" aria-hidden="true">{PHASE_GLYPH[shown.phase] ?? "✦"}</span>}
          <b className="duel-phasefx-text">{shown.big}</b>
          <span className="duel-phasefx-sub">{shown.small}</span>
        </div>
      </div>
    </div>
  );
}

/** Full-screen Victory / Defeat / Draw when a duel ends, with Rematch / Back to lobby. */
export function EndOverlay({ session, you, onRematch, onClose }: { session: SessionInfo; you: Seat | null; onRematch(): void; onClose(): void }) {
  const w = session.winner;
  const result = w === null ? "draw" : you === null ? "watch" : w === you ? "win" : "lose";
  const title = result === "draw" ? "Draw" : result === "win" ? "Victory" : result === "lose" ? "Defeat" : `${session.seats[w!]?.name ?? "Player"} wins`;
  useEffect(() => { play(result === "lose" ? "lose" : "win"); }, [result]);
  const opp = you === null ? null : session.seats[you === 0 ? 1 : 0];
  const asked = you !== null && session.rematch[you];
  return (
    <div className={`duel-end is-${result}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="duel-end-card">
        <div className="duel-end-title">{title}</div>
        {session.endReason && <p className="duel-end-reason">{session.endReason}</p>}
        <div className="duel-end-actions">
          {you !== null && opp && (
            <button className="primary" disabled={asked} onClick={onRematch}>{asked ? "Waiting for opponent…" : "Rematch"}</button>
          )}
          <Link className="button" to="/lobby">Back to lobby</Link>
          <button onClick={onClose}>View the board</button>
        </div>
        {you !== null && opp && session.rematch[you === 0 ? 1 : 0] && !asked && <p className="muted">{opp.name} wants a rematch.</p>}
      </div>
    </div>
  );
}

/** Shown over the board while the room's socket is down. */
export function ReconnectOverlay({ status }: { status: "connecting" | "open" | "closed" | "gone" }) {
  // ignore blips shorter than a moment (the socket reconnects on its own)
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (status === "open") { setLate(false); return; }
    const t = setTimeout(() => setLate(true), 700);
    return () => clearTimeout(t);
  }, [status]);
  if (status === "open" || status === "gone" || !late) return null;
  return (
    <div className="duel-reconnect" role="status" aria-live="assertive">
      <span className="duel-spinner" aria-hidden="true" />
      Connection lost. Reconnecting… your duel is safe.
    </div>
  );
}

export function MuteToggle() {
  const muted = useSyncExternalStore(onMuteChange, isMuted, isMuted);
  return (
    <button className="duel-help-btn duel-mute" onClick={() => setMuted(!muted)} aria-pressed={!muted}
      aria-label={muted ? "Turn sound effects on" : "Mute sound effects"} title={muted ? "Sound off" : "Sound on"}>
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
