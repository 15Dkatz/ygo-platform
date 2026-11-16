// /replay/:id: a duel saved in this browser, played back on the same board with the same animations, turn
// banners, chain display and log. Play / pause, step, speed and a scrubber.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Seat } from "../../shared/duelActions.ts";
import { Board } from "../components/duel/Board.tsx";
import { DuelLog } from "../components/duel/DuelLog.tsx";
import { TurnBanner } from "../components/duel/DuelFx.tsx";
import { ChainStack, applyChainEvents, type ChainLink } from "../components/duel/ChainStack.tsx";
import { useBoardAnimations } from "../components/duel/anim/useBoardAnimations.ts";
import { boardCodes, useCardData } from "../components/duel/useDuel.ts";
import { frameBoard, loadReplay, type Replay } from "../components/duel/replay.ts";
import { useDuelSettings } from "../components/duel/duelSettings.ts";
import { useUiScale } from "../components/duel/uiScale.ts";
import { useHtmlClasses } from "../components/duel/pageFlag.ts";
import { SleeveContext } from "../components/duel/Sleeve.tsx";
import { RarityContext, rarityLookup } from "../components/cards/Rarity.tsx";
import type { RarityMap } from "../../shared/rarity.ts";
import { PlayerBar } from "../components/duel/DuelParts.tsx";
import "../components/duel/duel.css";
import "../components/duel/duel-scene.css";

const SPEEDS = [0.5, 1, 2, 4];
const noop = () => undefined;

export default function ReplayPage() {
  const { id = "" } = useParams();
  const [rep, setRep] = useState<Replay | null | undefined>(undefined);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const anim = useBoardAnimations();
  const ds = useDuelSettings();
  useEffect(() => { void loadReplay(id).then(setRep); }, [id]);

  // every card the replay shows (names, images)
  const codes = useMemo(() => (rep ? [...new Set(rep.frames.flatMap((f, k) => (k % 10 === 0 || k === rep.frames.length - 1 ? boardCodes(frameBoard(rep, k)) : [])))] : []), [rep]);
  useCardData(codes);

  const board = rep ? frameBoard(rep, i) : null;
  // the open chain up to this frame
  const chain = useMemo<ChainLink[]>(() => {
    if (!rep) return [];
    let c: ChainLink[] = [];
    for (let k = 0; k <= i; k++) if (rep.frames[k].events) c = applyChainEvents(c, rep.frames[k].events!);
    return c;
  }, [rep, i]);

  /** Move to frame `to`: one step forward animates like the duel did; other jumps just show the board. */
  const go = useCallback((to: number) => {
    if (!rep) return;
    const t = Math.max(0, Math.min(rep.frames.length - 1, to));
    if (t === i + 1) anim.beforeState(frameBoard(rep, i), frameBoard(rep, t), rep.frames[t].events);
    setI(t);
  }, [rep, i, anim]);
  useLayoutEffect(() => { anim.animator.play(); }, [i, anim.animator]);

  // autoplay: the duel's own pace (gaps capped), divided by the speed
  useEffect(() => {
    if (!rep || !playing || i >= rep.frames.length - 1) return;
    const gap = rep.frames[i + 1].t - rep.frames[i].t;
    const ms = Math.min(2400, Math.max(rep.frames[i + 1].events?.length ? 650 : 250, gap)) / speed;
    const tm = setTimeout(() => go(i + 1), ms);
    return () => clearTimeout(tm);
  }, [rep, i, playing, speed, go]);

  // keys: space play/pause, arrows step
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowRight") { setPlaying(false); go(i + 1); }
      else if (e.key === "ArrowLeft") { setPlaying(false); go(i - 1); }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [go, i]);

  const zoom = useUiScale(!!board);
  useHtmlClasses({ "duel-live": !!board, "duel-scaled": !!zoom });
  const sleeves = rep?.sleeves;
  const sleeveFn = useCallback((owner: 0 | 1 | undefined) => (owner === undefined ? undefined : sleeves?.[owner]), [sleeves]);
  const rarityFn = useMemo(() => rarityLookup([rep?.rarity[0] as RarityMap | undefined, rep?.rarity[1] as RarityMap | undefined]), [rep]);
  const pageRef = useRef<HTMLElement | null>(null);
  const setPage = useCallback((el: HTMLElement | null) => { pageRef.current = el; anim.rootRef(el); }, [anim]);

  if (rep === undefined) return <section><p className="muted">Loading the replay…</p></section>;
  if (!rep || !board) return <section><h1>Replay not found</h1><p className="muted">Replays are kept in the browser that played the duel (the last 15). <Link to="/lobby">Back to the lobby</Link></p></section>;

  const me: Seat = rep.you ?? 0, other: Seat = me === 0 ? 1 : 0;
  const names: [string, string] = rep.names;
  const ui = { me, you: rep.you, pending: false, flash: new Set<string>(), selectedUid: null, hideStats: !ds.stats,
    onCard: noop, onZone: noop, onHover: noop, onDrop: noop, onLp: noop } as Parameters<typeof Board>[0]["ui"];
  const last = rep.frames.length - 1;

  return (
    <RarityContext.Provider value={rarityFn}>
    <SleeveContext.Provider value={sleeveFn}>
    <section ref={setPage} className={`duel-page is-live is-replay ${ds.tilt ? "is-tilt" : ""} ${zoom ? "is-scaled" : ""}`} data-resolve={ds.resolveFx} data-resolve-color={ds.resolveColor}
      style={{
        ["--tilt" as string]: `${ds.tilt}deg`, ["--field-scale" as string]: ds.fieldScale, ["--hand-scale" as string]: ds.handScale,
        ["--proj" as string]: Math.max(0.3, 1 - 0.0115 * ds.tilt), ["--field-y" as string]: ds.fieldY, ["--persp" as string]: `${ds.camera}px`, ["--persp-y" as string]: `${ds.cameraY}%`,
        ...(zoom ? { zoom, ["--ui-zoom" as string]: zoom } : {}),
        ["--hand-drop" as string]: `${ds.handDrop}%`, ["--opp-hand-drop" as string]: `-${ds.oppHandDrop}%`, ["--opp-hand-scale" as string]: ds.oppHandScale,
      }}
      data-phase={board.phase}>
      <div className="duel-topline replay-bar">
        <Link to="/lobby" className="muted">‹ Lobby</Link>
        <h1>Replay · {names[0]} vs {names[1]}</h1>
        <span className="replay-controls" role="group" aria-label="Replay controls">
          <button onClick={() => { setPlaying(false); go(0); }} title="Back to the start" aria-label="Back to the start">⏮</button>
          <button onClick={() => { setPlaying(false); go(i - 1); }} title="Step back (←)" aria-label="Step back">◀</button>
          <button className="primary" onClick={() => { if (i >= last) go(0); setPlaying((p) => !p || i >= last); }} title="Play / pause (Space)">{playing && i < last ? "Pause" : "Play"}</button>
          <button onClick={() => { setPlaying(false); go(i + 1); }} title="Step forward (→)" aria-label="Step forward">▶</button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Replay speed">{SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}</select>
          <input type="range" min={0} max={last} value={i} onChange={(e) => { setPlaying(false); go(Number(e.target.value)); }} aria-label="Position in the replay" />
          <span className="muted replay-pos">Turn {board.turn} · {i + 1}/{last + 1}</span>
        </span>
      </div>
      <div className="duel-layout">
        <div className="duel-main">
          <Board board={board} ui={ui}
            top={<PlayerBar board={board} player={other} you={rep.you} connected startLp={8000} />}
            bottom={<PlayerBar board={board} player={me} you={rep.you} connected startLp={8000} />}
            rail={<DuelLog log={board.log} names={names} you={rep.you} onHover={noop} onZoom={noop} />}
            status={<ChainStack chain={chain} you={rep.you} names={names} />}
            right={<div className="duel-turnno" aria-label={`Turn ${board.turn}`}><small>Turn</small><b>{board.turn}</b></div>}
          />
        </div>
      </div>
      <TurnBanner board={board} you={rep.you} />
      {i >= last && (
        <div className="replay-done">
          <b>{rep.winner === null ? "Draw" : `${names[rep.winner]} won`}</b>{rep.reason && <span className="muted"> · {rep.reason}</span>}
          <button onClick={() => { go(0); setPlaying(true); }}>Watch again</button>
        </div>
      )}
    </section>
    </SleeveContext.Provider>
    </RarityContext.Provider>
  );
}
