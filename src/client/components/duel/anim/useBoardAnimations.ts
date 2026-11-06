// One animation layer for both modes. Wire `beforeState` into useDuelSocket, `rootRef` onto
// the duel page, and call `animator.play()` in a layout effect whenever the board changes.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardState } from "../../../../shared/duel.ts";
import type { EngineEvent } from "../../../../shared/enginePrompts.ts";
import { refUid } from "../../engine/boardRefs.ts";
import { BoardAnimator } from "./animator.ts";
import { effectKind } from "./categories.ts";
import { engineIntents, manualIntents, type EngineChain } from "./intents.ts";
import { getCard } from "../useDuel.ts";
import { unlockAudioOnGesture } from "./sfx.ts";

export function useBoardAnimations() {
  /** Set every render: the room is rules-enforced (boards name cards by position, so only events animate). */
  const engineMode = useRef(false);
  const animator = useRef<BoardAnimator>(null);
  animator.current ??= new BoardAnimator();
  if (typeof window !== "undefined") (window as unknown as { __duelAnimator?: BoardAnimator }).__duelAnimator = animator.current;   // debugging aid
  /** Open chain: link -> uid of the card that started it. */
  const chain = useRef<EngineChain>({ uid: new Map(), code: new Map() });
  /** uid -> chain link numbers on that card ("1", or "1·3" when a card activates twice). */
  const [chainBadges, setChainBadges] = useState<Map<string, string>>(() => new Map());

  const beforeState = useCallback((prev: BoardState | null, next: BoardState, events: EngineEvent[] | null) => {
    if (events?.length) {
      const intents = prev ? engineIntents(events, prev, next, chain.current, (code) => effectKind(getCard(code))) : [];
      if (!prev) {
        for (const ev of events) {
          if (ev.e === "chain") chain.current.uid.set(ev.link, refUid(ev.card));
          else if (ev.e === "chainEnd") { chain.current.uid.clear(); chain.current.code.clear(); }
        }
      }
      if (events.some((e) => e.e === "turn")) { chain.current.uid.clear(); chain.current.code.clear(); }
      const badges = new Map<string, string>();
      for (const [link, uid] of [...chain.current.uid].sort((a, b) => a[0] - b[0])) badges.set(uid, badges.has(uid) ? `${badges.get(uid)}·${link}` : String(link));
      setChainBadges(badges);
      if (prev) animator.current!.capture(intents);
      return;
    }
    if (!prev) return;
    if (!events && !engineMode.current) animator.current!.capture(manualIntents(prev, next, (code) => {
      const c = getCard(code);
      return c && (c.category === "Spell" || c.category === "Trap") ? effectKind(c) : null;
    }), true);
  }, []);

  const rootRef = useCallback((el: HTMLElement | null) => { animator.current!.root = el; }, []);
  useEffect(() => unlockAudioOnGesture(), []);
  useEffect(() => () => { animator.current!.root = null; }, []);

  return { animator: animator.current, beforeState, rootRef, chainBadges, engineMode };
}
