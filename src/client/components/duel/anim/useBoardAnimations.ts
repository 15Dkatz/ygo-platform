// One animation layer for both modes. Wire `beforeState` into useDuelSocket, `rootRef` onto
// the duel page, and call `animator.play()` in a layout effect whenever the board changes.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardState } from "../../../../shared/duel.ts";
import type { EngineEvent } from "../../../../shared/enginePrompts.ts";
import { refUid } from "../../engine/boardRefs.ts";
import { BoardAnimator, reducedMotion } from "./animator.ts";
import { engineIntents, manualIntents } from "./intents.ts";

export function useBoardAnimations() {
  /** Set every render: the room is rules-enforced (boards name cards by position, so only events animate). */
  const engineMode = useRef(false);
  const animator = useRef<BoardAnimator>(null);
  animator.current ??= new BoardAnimator();
  const [chainBadges, setChainBadges] = useState<Map<string, number>>(() => new Map());

  const beforeState = useCallback((prev: BoardState | null, next: BoardState, events: EngineEvent[] | null) => {
    if (events?.length) {
      setChainBadges((cur) => {
        let m = cur;
        for (const ev of events) {
          if (ev.e === "chain") { m = new Map(m); m.set(refUid(ev.card), ev.link); }
          else if (ev.e === "chainEnd" || ev.e === "turn") m = new Map();
        }
        return m;
      });
    }
    if (!prev || reducedMotion()) return;
    // engine boards name cards by position: only the engine's events say what moved where
    if (events) animator.current!.capture(engineIntents(events, prev, next));
    else if (!engineMode.current) animator.current!.capture(manualIntents(prev, next), true);
  }, []);

  const rootRef = useCallback((el: HTMLElement | null) => { animator.current!.root = el; }, []);
  useEffect(() => () => { animator.current!.root = null; }, []);

  return { animator: animator.current, beforeState, rootRef, chainBadges, engineMode };
}
