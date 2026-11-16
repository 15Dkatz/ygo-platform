// DuelPage: feedback on the board. LP changes (sound, shake, a big number over that player's half with a flash
// at the screen edge) and attacks (the attack animation, attacker + target flash).
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardState } from "../../../../shared/duel.ts";
import type { Seat } from "../../../../shared/duelActions.ts";
import type { BoardAnimator } from "../anim/animator.ts";
import { locate } from "../menus.ts";
import type { useDuelSocket } from "../useDuel.ts";
import { play as sfx } from "../anim/sfx.ts";

type Toasts = ReturnType<typeof useDuelSocket>["conn"]["toasts"];
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);

export function useBoardFeedback(animator: BoardAnimator, board: BoardState | null | undefined, toasts: Toasts) {
  const [lpHit, setLpHit] = useState<{ delta: number; side: "top" | "bottom"; key: number } | null>(null);
  const onLpChange = useCallback((delta: number, side: "top" | "bottom" = "bottom") => {
    if (delta < 0) { sfx("damage"); animator.shake(); } else if (delta > 0) sfx("gain");
    if (delta) setLpHit({ delta, side, key: Date.now() });
  }, [animator]);
  useEffect(() => { if (!lpHit) return; const t = setTimeout(() => setLpHit(null), 1500); return () => clearTimeout(t); }, [lpHit]);

  // flash attacker + target on attack events
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const seenToasts = useRef(new Set<number>());
  useEffect(() => {
    for (const t of toasts) {
      const ev = t.event;
      if (seenToasts.current.has(t.id) || ev?.kind !== "attack") continue;
      seenToasts.current.add(t.id);
      animator.attack(ev.attacker, ev.target, other(ev.player), 0, true, (board && locate(board, ev.attacker)?.card.code) || undefined);
      const uids = [ev.attacker, ev.target].filter(Boolean) as string[];
      setFlash((f) => new Set([...f, ...uids]));
      setTimeout(() => setFlash((f) => { const n = new Set(f); uids.forEach((u) => n.delete(u)); return n; }), 1600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts, animator]);

  return { lpHit, onLpChange, flash };
}
