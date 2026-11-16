// DuelPage: one duel's lifetime in the room. A new number per duel (a rematch starts fresh LP counters), the
// replay recorded as it plays and saved in this browser when it ends, and the end-of-duel overlay (shown when a
// duel we were watching finishes, not on a reload of a finished room).
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { BoardState, SessionInfo } from "../../../../shared/duel.ts";
import type { Seat } from "../../../../shared/duelActions.ts";
import { ReplayRecorder, saveReplay } from "../replay.ts";

export function useDuelEnd(session: SessionInfo | null | undefined, board: BoardState | null | undefined, you: Seat | null, recorder: MutableRefObject<ReplayRecorder | null>) {
  const [endShown, setEndShown] = useState(false);
  const lastStage = useRef(session?.stage);
  const [duelNo, setDuelNo] = useState(0);
  const [replayId, setReplayId] = useState<string | null>(null);
  useEffect(() => {
    const was = lastStage.current;
    lastStage.current = session?.stage;
    if (session?.stage === "duel" && was !== "duel") { setDuelNo((n) => n + 1); recorder.current = new ReplayRecorder(); setReplayId(null); }
    if (session?.stage === "finished" && was === "duel") {
      setEndShown(true);
      // keep the replay (this browser)
      const rec = recorder.current, b = board;
      recorder.current = null;
      if (rec && b && session) {
        void saveReplay(rec, {
          names: [b.players[0].name, b.players[1].name], you, winner: session.winner ?? null, reason: session.endReason,
          sleeves: [session.seats[0]?.sleeve, session.seats[1]?.sleeve], rarity: [session.seats[0]?.rarity, session.seats[1]?.rarity],
        }, b).then(setReplayId);
      }
    }
    if (session?.stage !== "finished") setEndShown(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.stage]);
  return { duelNo, endShown, setEndShown, replayId };
}
