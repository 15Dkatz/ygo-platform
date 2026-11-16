// DuelPage: decisions made for you. Autopilot (demo: your whole side plays itself, ?autopilot=1), auto-pass
// (answer "don't chain" when nothing calls for a response; shared/autoPass.ts), the pre-duel coin toss /
// go-first under autopilot, and the "Chain?" / "Your move" callout when a decision lands on you.
import { useEffect, useRef, useState } from "react";
import type { BoardState, SessionInfo } from "../../../../shared/duel.ts";
import type { EngineResponse } from "../../../../shared/enginePrompts.ts";
import type { Seat } from "../../../../shared/duelActions.ts";
import { autoAnswer, type AutoPassMode } from "../../../../shared/autoPass.ts";
import { botResponse } from "../../../../worker/duel/engine/bot.ts";
import { SPEEDS, setAutopilot, useAutopilot } from "../autopilot.ts";
import { getCard, type useDuelSocket } from "../useDuel.ts";

type Socket = ReturnType<typeof useDuelSocket>;
import { play as sfx } from "../anim/sfx.ts";

interface AutoPlayInput {
  params: URLSearchParams;
  session: SessionInfo | null | undefined;
  board: BoardState | null | undefined;
  prompt: Socket["conn"]["prompt"];
  you: Seat | null;
  send: Socket["send"];
  toast: Socket["toast"];
  promptEvents: Socket["promptEvents"];
}

export function useAutoPlay({ params, session, board, prompt, you, send, toast, promptEvents }: AutoPlayInput) {
  // Autopilot (demo): your side plays itself so you can watch a whole duel. On with ?autopilot=1.
  const auto = useAutopilot();
  const autoOn = useRef(auto.on);
  autoOn.current = auto.on;
  useEffect(() => {
    if (params.get("autopilot") === "1") setAutopilot(true);
    return () => setAutopilot(false);
  }, [params]);
  const autoPrompt = auto.on && session?.mode === "engine" && session.stage === "duel" && prompt && prompt.player === you ? prompt : null;
  useEffect(() => {
    if (!autoPrompt) return;
    const t = setTimeout(() => send({ t: "respond", response: botResponse(autoPrompt, Math.random, "showcase") }), SPEEDS[auto.speed]);
    return () => clearTimeout(t);
  }, [autoPrompt, auto.speed, send]);
  // Auto-pass chains: answer "don't chain" for you when nothing calls for a response (see shared/autoPass.ts)
  const [autoPass, setAutoPassState] = useState<AutoPassMode>(() => {
    try { const v = localStorage.getItem("ygo.autoPass"); return v === "ask" || v === "never" ? v : "smart"; } catch { return "smart"; }
  });
  const setAutoPass = (m: AutoPassMode) => { setAutoPassState(m); try { localStorage.setItem("ygo.autoPass", m); } catch { /* storage blocked */ } };
  // auto-chaining: pass when nothing calls for a response, activate a lone mandatory effect, default chain order
  const isMonsterCode = (code: number) => { const t = getCard(code)?.type; return t ? /Monster/.test(t) : true; };
  // cards offered at your previous chance to chain (and passed on): quick effects repeating every phase
  const chainSeen = useRef<{ id: number; codes: Set<number> }>({ id: -1, codes: new Set() });
  const lastChainPrompt = useRef<{ id: number; codes: Set<number> } | null>(null);
  if (prompt?.kind === "selectChain" && prompt.player === you && lastChainPrompt.current?.id !== prompt.id) {
    if (lastChainPrompt.current) chainSeen.current = lastChainPrompt.current;   // the previous chance becomes "seen"
    lastChainPrompt.current = { id: prompt.id, codes: new Set(prompt.cards.map((c) => c.code)) };
  }
  const auto2 = !auto.on && session?.stage === "duel" ? autoAnswer(prompt, you, promptEvents.current, autoPass, isMonsterCode, chainSeen.current.codes) : null;
  const autoKey = auto2 && prompt ? `${prompt.id}:${JSON.stringify(auto2)}` : null;
  useEffect(() => {
    if (!auto2 || !prompt) return;
    const p = prompt;
    const t = setTimeout(() => {
      const { passed, ...body } = auto2 as typeof auto2 & { passed?: boolean };
      send({ t: "respond", response: { promptId: p.id, ...body } as EngineResponse });
      // say so when it passed up something you could have chained
      // (only the first time: a quick effect skipped again at every phase change isn't news)
      if (passed && p.kind === "selectChain" && p.cards.length && !p.cards.every((c) => chainSeen.current.codes.has(c.code))) {
        const names = [...new Set(p.cards.map((c) => getCard(c.code)?.name).filter(Boolean))].slice(0, 2).join(", ");
        toast({ text: `Auto-passed${names ? `: you could have chained ${names}` : ""}. (⚙ Chain prompts)` }, 2600);
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  // "Your move" callout: a decision lands on you outside your own Main / Battle Phase flow (mostly a chance to chain)
  const [callout, setCallout] = useState<{ key: number; text: string; sub?: string; tone: "chain" | "move" } | null>(null);
  const calloutFor = prompt && prompt.player === you && !auto.on && !auto2 && session?.stage === "duel" ? prompt : null;
  useEffect(() => {
    const p = calloutFor;
    if (!p || !board) return;
    const theirTurn = board.turnPlayer !== you;
    if (p.kind === "selectChain") {
      const names = [...new Set(p.cards.map((c) => getCard(c.code)?.name).filter(Boolean))].slice(0, 2).join(" · ");
      setCallout({ key: p.id, text: p.forced ? "Activate?" : "Chain?", sub: names || undefined, tone: "chain" });
      sfx("chain");
    } else if (theirTurn && p.kind !== "idle" && p.kind !== "battle") {
      setCallout({ key: p.id, text: "Your move", sub: p.hint, tone: "move" });
      sfx("turn");
    } else return;
    const t = setTimeout(() => setCallout(null), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calloutFor?.id]);

  // ...and the pre-duel steps: toss the coin, go first
  useEffect(() => {
    if (!auto.on || !session || you === null) return;
    const t = setTimeout(() => {
      if (session.stage === "rps" && !session.rps.mine) send({ t: "coinToss" });
      else if (session.stage === "choose" && session.chooser === you) send({ t: "chooseOrder", first: true });
    }, 600);
    return () => clearTimeout(t);
  }, [auto.on, session, you, send]);

  return { auto, autoOn, autoPass, setAutoPass, callout };
}
