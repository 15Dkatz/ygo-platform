// Duel "moments": turn banner + phase ribbon, the end-of-duel overlay, the reconnecting
// overlay and the sound toggle. Pure presentation; the page decides when they show.

import { usePageFlag } from "./pageFlag.ts";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { SleeveBack } from "./Sleeve.tsx";
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
      play(mine ? "turn-mine" : "turn-theirs");
    } else if (board.phase !== prev.phase && board.phase !== "draw" && board.phase !== "standby") {
      setShown({ key: `p${board.turn}${board.phase}`, big: PHASE_LABEL[board.phase], small: `Turn ${board.turn} · ${who}`, mine, phase: board.phase, turn: false });
      if (board.phase === "main1" || board.phase === "battle" || board.phase === "main2" || board.phase === "end") play(`phase-${board.phase}`);
    } else return;
    const t = setTimeout(() => setShown(null), board.turn !== prev.turn ? 1700 : 1350);
    return () => clearTimeout(t);
  }, [board.turn, board.phase, board.turnPlayer, board.players, you]);
  if (!shown) return null;
  const { key, ...b } = shown;
  return <PhaseBanner key={key} {...b} />;
}

/** The banner itself (the duel page and the /dev/summons lab show it). */
export function PhaseBanner({ big, small, mine, phase, turn }: { big: string; small: string; mine: boolean; phase: string; turn: boolean }) {
  usePageFlag("fx-battle", phase === "battle");
  return (
    <div className={`duel-phasefx ph-${phase} ${turn ? "is-turn" : "is-phase"} ${mine ? "is-mine" : "is-theirs"}`} aria-live="polite">
      <div className="duel-phasefx-band">
        <div className="duel-phasefx-inner">
          {!turn && <span className="duel-phasefx-glyph" aria-hidden="true">{PHASE_GLYPH[phase] ?? "✦"}</span>}
          <b className="duel-phasefx-text">{big}</b>
          <span className="duel-phasefx-sub">{small}</span>
        </div>
      </div>
    </div>
  );
}

/** Full-screen Victory / Defeat / Draw when a duel ends, with Rematch / Back to lobby. */
export function EndOverlay({ session, you, onRematch, onClose, children, lp, stats, replayId }: {
  session: SessionInfo; you: Seat | null; onRematch(): void; onClose(): void; children?: ReactNode;
  /** final Life Points [seat 0, seat 1] */
  lp?: [number, number];
  /** the duel's numbers (DuelStats) */
  stats?: ReactNode;
  /** this duel's replay, saved in this browser */
  replayId?: string | null;
}) {
  const w = session.winner;
  const result = w === null ? "draw" : you === null ? "watch" : w === you ? "win" : "lose";
  const title = result === "draw" ? "Draw" : result === "win" ? "Victory" : result === "lose" ? "Defeat" : `${session.seats[w!]?.name ?? "Player"} wins`;
  useEffect(() => { play(result === "lose" ? "lose" : "win"); }, [result]);
  const opp = you === null ? null : session.seats[you === 0 ? 1 : 0];
  const asked = you !== null && session.rematch[you];
  const theyAsked = you !== null && !!opp && session.rematch[you === 0 ? 1 : 0];
  // you first (left), then the opponent
  const order: (0 | 1)[] = you === 1 ? [1, 0] : [0, 1];
  return (
    <div className={`duel-end is-${result} ${children ? "has-setup" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="duel-end-card">
        <div className="duel-end-hero">
          <div className="duel-end-title">{title}</div>
          {session.endReason && <p className="duel-end-reason">{session.endReason}</p>}
          <div className="duel-end-vs">
            {order.map((s, i) => {
              const seat = session.seats[s];
              const won = session.winner === s;
              return (
                <Fragment key={s}>
                  {i === 1 && <span className="duel-end-vs-x">VS</span>}
                  <div className={`duel-end-duelist ${won ? "is-winner" : session.winner === null ? "" : "is-loser"}`}>
                    <span className="duel-end-pile" aria-hidden="true"><SleeveBack sleeve={seat?.sleeve} /></span>
                    <b>{seat?.name ?? "Player"}{you === s ? " (you)" : ""}</b>
                    {seat?.profile?.title && <span className="pf-title">{seat.profile.title}</span>}
                    {lp && <span className="duel-end-lp">{lp[s].toLocaleString()} LP</span>}
                    {won && <span className="duel-end-crown">Winner</span>}
                  </div>
                </Fragment>
              );
            })}
          </div>
          {stats && <div className="duel-end-stats">{stats}</div>}
          <div className="duel-end-actions">
            {you !== null && opp && (
              <button className="primary duel-end-rematch" disabled={asked} onClick={onRematch}>{asked ? "Waiting for opponent…" : theyAsked ? "Accept rematch" : "Rematch"}</button>
            )}
            <Link className="button" to="/lobby">Back to lobby</Link>
            <button onClick={onClose}>View the board</button>
            {replayId && <Link className="button duel-end-replay" to={`/replay/${replayId}`} target="_blank">▶ Watch replay</Link>}
          </div>
          {theyAsked && !asked && <p className="duel-end-note">{opp!.name} wants a rematch.</p>}
        </div>
        {children && <div className="duel-end-setup">{children}</div>}
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
