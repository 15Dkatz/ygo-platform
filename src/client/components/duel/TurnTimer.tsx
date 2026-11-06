import { useEffect, useMemo, useState } from "react";
import type { TurnClock } from "../../../shared/duel.ts";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** One player's turn clock. Ticks locally between server updates; the server decides time-outs. */
export function TurnTimer({ timer, seat, label }: { timer: TurnClock; seat: 0 | 1; label?: string }) {
  // when this snapshot arrived, so local ticking needs no clock sync with the server
  const receivedAt = useMemo(() => Date.now(), [timer]);
  const running = timer.running === seat;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);
  const left = timer.remaining[seat] - (running ? (timer.serverNow - timer.since) + (Date.now() - receivedAt) : 0);
  const low = left <= 30_000;
  return (
    <span className={`turn-timer${running ? " is-running" : ""}${low ? " is-low" : ""}`} title={`${label ?? "Time"} left this turn (${timer.limitSec / 60} min per turn)`}
      role="timer" aria-live={running && low ? "polite" : "off"}>
      <span aria-hidden="true">⏱</span> {fmt(left)}
    </span>
  );
}
