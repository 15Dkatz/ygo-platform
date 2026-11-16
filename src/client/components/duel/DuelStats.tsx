// The duel in numbers, for the end screen: worked out from the duel log (what both players saw).
import type { Seat } from "../../../shared/duelActions.ts";
import { classifyLog } from "./DuelLog.tsx";

export interface Stats { turns: number; damage: [number, number]; summons: [number, number]; activations: number; longestChain: number; biggestHit: { amount: number; to: Seat | null } }

export function duelStats(log: string[], names: [string, string], turns: number): Stats {
  const s: Stats = { turns, damage: [0, 0], summons: [0, 0], activations: 0, longestChain: 0, biggestHit: { amount: 0, to: null } };
  for (const line of log) {
    const info = classifyLog(line, names);
    if (info.kind === "lp-loss" && info.actor !== null) {
      const n = Number(/lost (\d+) LP/.exec(line)?.[1] ?? 0);
      // damage dealt = what the other player lost
      s.damage[info.actor === 0 ? 1 : 0] += n;
      if (n > s.biggestHit.amount) s.biggestHit = { amount: n, to: info.actor };
    } else if (info.kind === "summon" && info.actor !== null) s.summons[info.actor]++;
    else if (info.kind === "chain") {
      s.activations++;
      s.longestChain = Math.max(s.longestChain, Number(/^Chain (\d+)/.exec(line)?.[1] ?? 0));
    }
  }
  return s;
}

export function DuelStats({ log, names, you, turns }: { log: string[]; names: [string, string]; you: Seat | null; turns: number }) {
  const s = duelStats(log, names, turns);
  const me: Seat = you ?? 0, them: Seat = me === 0 ? 1 : 0;
  const row = (label: string, a: number | string, b: number | string) => (
    <div className="duel-endstats-row"><b>{a}</b><span>{label}</span><b>{b}</b></div>
  );
  return (
    <div className="duel-endstats" aria-label="Duel statistics">
      {row("Damage dealt", s.damage[me].toLocaleString(), s.damage[them].toLocaleString())}
      {row("Summons", s.summons[me], s.summons[them])}
      <div className="duel-endstats-chips">
        <span><b>{s.turns}</b> turns</span>
        <span><b>{s.activations}</b> activations</span>
        <span>longest chain <b>{s.longestChain || "–"}</b></span>
        {s.biggestHit.amount > 0 && <span>biggest hit <b>{s.biggestHit.amount.toLocaleString()}</b></span>}
      </div>
    </div>
  );
}
