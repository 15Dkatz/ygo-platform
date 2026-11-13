// PHASE 3 owns this page (duel board). PHASE 4 adds engine-mode prompts.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { BoardState, CardInstance, TurnClock } from "../../shared/duel.ts";
import type { EngineCardRef, EngineResponse } from "../../shared/enginePrompts.ts";
import { enginePhaseControls, enginePhaseResponse, manualPhaseControls, type PhaseControls } from "../../shared/phases.ts";
import { PHASE_LABEL, type DuelAction, type Phase, type Seat } from "../../shared/duelActions.ts";
import { Board, PendulumStrip, type BoardUI, type Matchup, type ZoneRef } from "../components/duel/Board.tsx";
import { indexBoard, refUid } from "../components/engine/boardRefs.ts";
import { attackOutcome } from "../../shared/matchup.ts";
import { CardView } from "../components/duel/CardView.tsx";
import { useDecks } from "../components/duel/DeckPicker.tsx";
import { buildMenu, dropAction, locate, occupantAt, pileMenu, type MenuItem, type Pending } from "../components/duel/menus.ts";
import { ContextMenu, Modal, Toasts } from "../components/duel/Overlays.tsx";
import { PreDuel } from "../components/duel/PreDuel.tsx";
import { CardPreview, LogChat, LogText } from "../components/duel/SidePanel.tsx";
import { boardCodes, getCard, useCardData, useDuelIdentity, useDuelSocket } from "../components/duel/useDuel.ts";
import { AnimatedLp } from "../components/duel/anim/AnimatedLp.tsx";
import { useBoardAnimations } from "../components/duel/anim/useBoardAnimations.ts";
import { play as sfx } from "../components/duel/anim/sfx.ts";
import { EndOverlay, MuteToggle, ReconnectOverlay, TurnBanner } from "../components/duel/DuelFx.tsx";
import { useEngineBoard } from "../components/engine/EngineBoard.tsx";
import { TurnTimer } from "../components/duel/TurnTimer.tsx";
import { SkinPicker } from "../components/SkinPicker.tsx";
import { DuelSettingsButton } from "../components/duel/DuelSettingsPanel.tsx";
import { ChainStack } from "../components/duel/ChainStack.tsx";
import { duelSettings, useDuelSettings } from "../components/duel/duelSettings.ts";
import { SPEEDS, setAutopilot, setSpeed, useAutopilot, type Speed } from "../components/duel/autopilot.ts";
import { botResponse } from "../../worker/duel/engine/bot.ts";
import { demoDeck } from "../../shared/starterDecks.ts";
import { autoAnswer, type AutoPassMode } from "../../shared/autoPass.ts";
import { nothingLeftToDo } from "../../shared/turnFlow.ts";
import "../components/duel/duel.css";
import "./DuelPage.css";
import "../components/duel/duel-scene.css";

type Viewer =
  | { kind: "pile"; player: Seat; zone: "gy" | "banished" | "extra" }
  | { kind: "peek" }
  | { kind: "materials"; uid: string };

const PHASE_SHORT: Record<Phase, string> = { draw: "DP", standby: "SP", main1: "M1", battle: "BP", main2: "M2", end: "EP" };
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const NO_PLAYER = { name: "", lp: 0, deck: [], hand: [], extra: [], gy: [], banished: [], monster: [], spelltrap: [], field: null, pendulum: [] };
const NO_BOARD: BoardState = { players: [NO_PLAYER, NO_PLAYER], extraMonster: [], turn: 1, turnPlayer: 0, phase: "draw", log: [] };

export function DuelPage() {
  const { roomId = "" } = useParams();
  const [params] = useSearchParams();
  const anim = useBoardAnimations();
  const { conn, send, toast, clearPeek, promptEvents, chain } = useDuelSocket(roomId, { beforeState: anim.beforeState });
  const { identity } = useDuelIdentity();
  const { decks, deck, deckId, setDeckId } = useDecks();
  const { board, session, room, you } = conn;

  const [preview, setPreview] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; title?: string; items: MenuItem[] } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [lpFor, setLpFor] = useState<Seat | null>(null);
  const [zoomCard, setZoomCard] = useState<number | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [help, setHelp] = useState(false);
  const [endShown, setEndShown] = useState(false);
  // your own hand layout after Shuffle hand (any number of times; only you see the new order)
  const [handOrder, setHandOrder] = useState<string[] | null>(null);
  const attackerRef = useRef<EngineCardRef | null>(null);
  // ⚙ duel settings: 3D tilt angle, board info, confirmations (remembered in this browser)
  const ds = useDuelSettings();
  const tilt = ds.tilt > 0;
  // PC scene: log + chat live in a drawer (closed by default), the card preview floats on hover
  const [drawer, setDrawer] = useState(false);
  const [hovering, setHovering] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // the preview floats on the side away from the pointer, so it never covers what you're hovering
  const pointerX = useRef(0);
  useEffect(() => {
    const move = (e: PointerEvent) => { pointerX.current = e.clientX; };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  const [previewRight, setPreviewRight] = useState(false);
  // for the Z (zoom) key: what's hovered right now
  const hoveringRef = useRef(false), previewRef = useRef<number | null>(null);
  hoveringRef.current = hovering;
  previewRef.current = preview;
  const onHoverCard = useCallback((code: number | null) => {
    clearTimeout(hoverTimer.current);
    if (code) { setPreview(code); setHovering(true); setPreviewRight(pointerX.current < window.innerWidth / 2); }
    else hoverTimer.current = setTimeout(() => setHovering(false), 350);
  }, []);

  const live = !!board && (session?.stage === "duel" || session?.stage === "finished");
  const playing = live && session?.stage === "duel" && you !== null;
  const me: Seat = you ?? 0;
  const engineMode = (session?.mode ?? conn.room?.mode) === "engine";
  anim.engineMode.current = engineMode;
  /** Shuffle hand: always available. Reorders your hand locally (the rules engine only allows it now and then). */
  const shuffleHand = () => {
    if (!board) return;
    const uids = board.players[me].hand.map((c) => c.uid);
    for (let i = uids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uids[i], uids[j]] = [uids[j], uids[i]]; }
    setHandOrder(uids);
    requestAnimationFrame(() => anim.animator.shuffleZone(`hand:${me}:`));
  };
  // play the animations captured for this board as soon as it is on screen
  useLayoutEffect(() => { anim.animator.play(); }, [board, anim.animator]);
  // card codes mentioned anywhere in an engine prompt, so their names/images load
  const promptCodes = useMemo(() => {
    const out: { code: number }[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.code === "number" && o.code > 0) out.push({ code: o.code });
        Object.values(o).forEach(walk);
      }
    };
    walk(conn.prompt);
    return out;
  }, [conn.prompt]);
  useCardData(boardCodes(board, [...(conn.peek?.cards ?? []), ...conn.toasts.flatMap((t) => (t.event?.kind === "reveal" ? t.event.cards : [])), ...(promptCodes as CardInstance[])]));

  // auto-join from the lobby (?join=1) once identity + deck are known
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current || params.get("join") !== "1" || !session || !identity || !deck || conn.status !== "open") return;
    if (you === null && session.stage === "lobby" && session.seats.some((s) => s === null)) {
      autoJoined.current = true;
      const d = params.get("demo") === "1" ? demoDeck("synchro") : deck;   // demo rooms: the Synchro combo deck
      send({ t: "join", deckId: d.id, main: d.main, extra: d.extra, side: d.side });
    } else if (you !== null) autoJoined.current = true;
  }, [params, session, identity, deck, you, conn.status, send]);

  // Autopilot (demo): your side plays itself so you can watch a whole duel. On with ?autopilot=1.
  const auto = useAutopilot();
  const autoOn = useRef(auto.on);
  autoOn.current = auto.on;
  useEffect(() => {
    if (params.get("autopilot") === "1") setAutopilot(true);
    return () => setAutopilot(false);
  }, [params]);
  const autoPrompt = auto.on && session?.mode === "engine" && session.stage === "duel" && conn.prompt && conn.prompt.player === you ? conn.prompt : null;
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
  const auto2 = !auto.on && session?.stage === "duel" ? autoAnswer(conn.prompt, you, promptEvents.current, autoPass, isMonsterCode) : null;
  const autoKey = auto2 && conn.prompt ? `${conn.prompt.id}:${JSON.stringify(auto2)}` : null;
  useEffect(() => {
    if (!auto2 || !conn.prompt) return;
    const p = conn.prompt;
    const t = setTimeout(() => {
      const { passed, ...body } = auto2 as typeof auto2 & { passed?: boolean };
      send({ t: "respond", response: { promptId: p.id, ...body } as EngineResponse });
      // say so when it passed up something you could have chained
      if (passed && p.kind === "selectChain" && p.cards.length) {
        const names = [...new Set(p.cards.map((c) => getCard(c.code)?.name).filter(Boolean))].slice(0, 2).join(", ");
        toast({ text: `Auto-passed${names ? `: you could have chained ${names}` : ""}. (⚙ Chain prompts)` }, 2600);
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  // ...and the pre-duel steps: toss the coin, go first
  useEffect(() => {
    if (!auto.on || !session || you === null) return;
    const t = setTimeout(() => {
      if (session.stage === "rps" && !session.rps.mine) send({ t: "coinToss" });
      else if (session.stage === "choose" && session.chooser === you) send({ t: "chooseOrder", first: true });
    }, 600);
    return () => clearTimeout(t);
  }, [auto.on, session, you, send]);

  // the end-of-duel overlay appears when a duel we were watching finishes (not on a reload of a finished room)
  const lastStage = useRef(session?.stage);
  // a new number per duel in this room (a rematch starts fresh LP counters, with no "+8000" pop-up)
  const [duelNo, setDuelNo] = useState(0);
  useEffect(() => {
    const was = lastStage.current;
    lastStage.current = session?.stage;
    if (session?.stage === "duel" && was !== "duel") setDuelNo((n) => n + 1);
    if (session?.stage === "finished" && was === "duel") setEndShown(true);
    if (session?.stage !== "finished") setEndShown(false);
  }, [session?.stage]);

  // unread lines while the log / chat drawer is closed
  const lineCount = (board?.log.length ?? 0) + conn.chat.length;
  const seenLines = useRef(lineCount);
  if (drawer) seenLines.current = lineCount;
  const unread = Math.max(0, lineCount - seenLines.current);

  // long-press on a card (touch) opens the big preview
  useEffect(() => {
    const onInspect = (e: Event) => { const code = (e as CustomEvent<number>).detail; if (code > 0) { setPreview(code); setZoomCard(code); } };
    addEventListener("duel-inspect", onInspect);
    return () => removeEventListener("duel-inspect", onInspect);
  }, []);

  // LP: shake + sound on damage, chime on gain
  const onLpChange = useCallback((delta: number) => {
    if (delta < 0) { sfx("damage"); anim.animator.shake(); } else if (delta > 0) sfx("gain");
  }, [anim.animator]);

  // open the deck viewer whenever a private peek arrives
  useEffect(() => { if (conn.peek) setViewer({ kind: "peek" }); }, [conn.peek]);

  // flash attacker + target on attack events
  const seenToasts = useRef(new Set<number>());
  useEffect(() => {
    for (const t of conn.toasts) {
      if (seenToasts.current.has(t.id) || t.event?.kind !== "attack") continue;
      seenToasts.current.add(t.id);
      anim.animator.attack(t.event.attacker, t.event.target, other(t.event.player), 0, true, (board && locate(board, t.event.attacker)?.card.code) || undefined);
      const uids = [t.event.attacker, t.event.target].filter(Boolean) as string[];
      setFlash((f) => new Set([...f, ...uids]));
      setTimeout(() => setFlash((f) => { const n = new Set(f); uids.forEach((u) => n.delete(u)); return n; }), 1600);
    }
  }, [conn.toasts, anim.animator]);

  const act = useCallback((a: DuelAction) => send({ t: "action", action: a }), [send]);
  const askNumber = (label: string, def: number) => {
    const v = prompt(label, String(def));
    if (v === null) return null;
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const askText = (label: string, def: string) => prompt(label, def);

  const cardMenu = (card: CardInstance, at: ZoneRef, x: number, y: number) => {
    if (!board) return;
    const data = getCard(card.code);
    const items = you === null
      ? (card.code > 0 ? [{ label: "View card", run: () => setZoomCard(card.code) }] : [])
      : buildMenu({
        board, you, card, at, data, act,
        pick: (p) => { setPending(p); setViewer(null); },
        preview: (code) => setZoomCard(code),
        showMaterials: (c) => setViewer({ kind: "materials", uid: c.uid }),
        askNumber, askText,
      });
    if (!items.length) return;
    setMenu({ x, y, title: data?.name ?? (card.token ? "Token" : card.code ? `Card ${card.code}` : "Face-down card"), items });
  };

  // rules-enforced: the engine's prompt, played on the board
  const engineBoard = useEngineBoard({
    prompt: playing && engineMode ? conn.prompt : null,
    board: board ?? NO_BOARD,
    you: me,
    respond: (response) => {
      // remember the attacker, to preview each target's outcome in the target prompt that follows
      const p = conn.prompt;
      attackerRef.current = response.kind === "battle" && response.action === "attack" && p?.kind === "battle" ? p.attacks[response.index] ?? null : null;
      send({ t: "respond", response });
    },
    openMenu: setMenu,
    cardName: (code) => getCard(code)?.name,
    preview: (code) => setZoomCard(code),
    onHover: onHoverCard,
    showMaterials: (uid) => setViewer({ kind: "materials", uid }),
    toast: (text) => toast({ text, error: true }),
    chainBadges: anim.chainBadges,
  });
  const engineUi = engineMode && board;

  // attack matchup: while picking the target of an attack, label each target with the battle result
  const matchup = useMemo(() => {
    const a = attackerRef.current;
    const p = conn.prompt;
    if (!ds.matchup || !engineMode || !board || !a || !p || p.player !== you || p.kind !== "selectCard" || board.phase !== "battle") return undefined;
    const idx = indexBoard(board);
    const attacker = idx.get(refUid(a))?.card;
    if (!attacker?.faceUp) return undefined;
    const fighter = (c: CardInstance) => {
      const d = c.code > 0 ? getCard(c.code) : null;
      return { atk: c.atk ?? d?.atk ?? 0, def: c.def ?? d?.defense ?? 0, position: c.position, faceUp: c.faceUp && c.code > 0 };
    };
    const out = new Map<string, Matchup>();
    for (const r of p.cards) {
      if (r.controller === you || r.location !== "monster") return undefined;   // not an attack-target prompt
      const t = idx.get(refUid(r))?.card;
      if (t) out.set(t.uid, attackOutcome(fighter(attacker), fighter(t)));
    }
    return out;
  }, [engineMode, board, conn.prompt, you, ds.matchup]);

  const resolvePending = (at: ZoneRef, target: CardInstance | null) => {
    if (!board || !pending || you === null) return;
    const p = pending;
    setPending(null);
    const src = locate(board, p.uid);
    if (!src) return toast({ text: "That card has moved.", error: true });
    if (p.kind === "attack") {
      if (!target) return;
      act({ type: "attack", uid: p.uid, targetUid: target.uid });
    } else if (p.kind === "attach") {
      if (!target) return toast({ text: "Tap a monster on the field.", error: true });
      act({ type: "attach", uid: p.uid, targetUid: target.uid });
    } else {
      const r = dropAction(src.card, src.at, at, getCard(src.card.code), you, target ?? occupantAt(board, at));
      if (r && "error" in r) toast({ text: r.error, error: true });
      else if (r) act(r);
    }
  };

  const ui: BoardUI = {
    me, you, pending: !!pending, flash, selectedUid: pending?.uid ?? null, handOrder, matchup, hideStats: !ds.stats,
    marks: engineUi ? engineBoard.marks : undefined,
    onHover: onHoverCard,
    onCard: (card, at, e) => {
      if (engineUi) return engineBoard.onCard(card, at, e);
      if (pending) return resolvePending(at, card);
      cardMenu(card, at, e.clientX, e.clientY);
    },
    onZone: (at, e) => {
      if (engineUi) {
        if (engineBoard.onZone(at, e)) return;
        if ((at.zone === "gy" || at.zone === "banished" || at.zone === "extra") && board.players[at.player][at.zone].length) setViewer({ kind: "pile", player: at.player, zone: at.zone });
        return;
      }
      if (pending) return resolvePending(at, null);
      if (!board) return;
      if (at.zone === "gy" || at.zone === "banished" || at.zone === "extra") {
        if (!board.players[at.player][at.zone].length) return;
        return setViewer({ kind: "pile", player: at.player, zone: at.zone });
      }
      if (at.zone === "deck") {
        const items = pileMenu({ at, you, count: board.players[at.player].deck.length, act, view: () => undefined, askNumber });
        if (items.length) setMenu({ x: e.clientX, y: e.clientY, title: "Deck", items });
      }
    },
    onDrop: (at, uid, e) => {
      if (engineUi) return engineBoard.onDrop(at, uid, e);
      if (!board || you === null) return;
      const src = locate(board, uid);
      if (!src) return;
      const r = dropAction(src.card, src.at, at, getCard(src.card.code), you, occupantAt(board, at));
      if (r && "error" in r) toast({ text: r.error, error: true });
      else if (r) act(r);
    },
    onLp: (player) => setLpFor(player),
  };

  // Phase track: one rule set (src/shared/phases.ts) for the track, Next phase / End turn and the shortcuts.
  const myPrompt = conn.prompt && conn.prompt.player === you ? conn.prompt : null;
  // "forward" signal: your Main / Battle Phase with nothing left to play
  const nothingToDo = engineMode && nothingLeftToDo(myPrompt);
  const waitingName = session && board ? (session.seats[board.turnPlayer === me ? other(me) : board.turnPlayer]?.name ?? "your opponent") : "your opponent";
  const phaseCtl: PhaseControls | null = !board ? null
    : engineMode ? enginePhaseControls(board, you, myPrompt, waitingName)
    : manualPhaseControls(board, you);
  const goPhase = useCallback((target: Phase | "endTurn") => {
    // ending the turn with your Normal Summon unused is usually a misclick: ask first
    if (engineMode && (target === "endTurn" || target === "end") && !autoOn.current && duelSettings().confirmEnd && myPrompt?.kind === "idle" && myPrompt.summons.length > 0) {
      const names = [...new Set(myPrompt.summons.map((c) => getCard(c.code)?.name).filter(Boolean))].slice(0, 3).join(", ");
      if (!confirm(`You haven't used your Normal Summon this turn${names ? ` (you could summon ${names})` : ""}. End your turn anyway?`)) return;
    }
    if (engineMode) {
      const body = enginePhaseResponse(myPrompt, target);
      if (body && myPrompt) send({ t: "respond", response: { ...body, promptId: myPrompt.id } as EngineResponse });
    } else if (target === "endTurn") act({ type: "endTurn" });
    else act({ type: "phase", phase: target });
  }, [engineMode, myPrompt, send, act]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") { setPending(null); return; }
      if (e.key === "?") { setHelp((h) => !h); return; }
      if (e.key.toLowerCase() === "z" && hoveringRef.current && previewRef.current) { setZoomCard(previewRef.current); e.preventDefault(); return; }
      if (!playing || !board || menu) return;
      const k = e.key.toLowerCase();
      if (k === "d" && !engineMode) act({ type: "draw" });
      else if (k === "h" && !engineMode) act({ type: "shuffle" });
      else if (k === "n" && phaseCtl?.next) goPhase(phaseCtl.next);
      else if (k === "e" && phaseCtl?.endTurn.enabled) goPhase("endTurn");
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [playing, board, you, menu, act, engineMode, phaseCtl, goPhase]);

  const describe = (uid: string) => {
    const f = board && locate(board, uid);
    if (!f) return "a monster";
    return f.card.code > 0 ? getCard(f.card.code)?.name ?? "a monster" : "a face-down monster";
  };

  const names: [string, string] = [board?.players[0].name ?? session?.seats[0]?.name ?? "Player 1", board?.players[1].name ?? session?.seats[1]?.name ?? "Player 2"];

  // ---------- render ----------

  if (conn.status === "gone") {
    return (
      <section className="duel-page">
        <h1>Room not found</h1>
        <p className="muted">This duel room has closed. <Link to="/lobby">Back to the lobby</Link></p>
      </section>
    );
  }

  const viewerCards = (): { title: string; cards: CardInstance[]; at: (i: number) => ZoneRef; host?: CardInstance } | null => {
    if (!viewer || !board) return null;
    if (viewer.kind === "pile") {
      const cards = board.players[viewer.player][viewer.zone];
      const whose = viewer.player === you ? "Your" : `${names[viewer.player]}'s`;
      const label = viewer.zone === "gy" ? "GY" : viewer.zone === "banished" ? "banished cards" : "Extra Deck";
      // newest first for GY / banished
      const order = viewer.zone === "extra" ? cards.map((_, i) => i) : cards.map((_, i) => cards.length - 1 - i);
      return { title: `${whose} ${label} (${cards.length})`, cards: order.map((i) => cards[i]), at: (i) => ({ zone: viewer.zone, player: viewer.player, slot: order[i] }) };
    }
    if (viewer.kind === "peek") {
      if (!conn.peek || you === null) return null;
      const inDeck = new Set(board.players[you].deck.map((c) => c.uid));
      const cards = conn.peek.cards.filter((c) => inDeck.has(c.uid));
      return { title: `${conn.peek.title} (${cards.length})`, cards, at: () => ({ zone: "deck", player: you }) };
    }
    const f = locate(board, viewer.uid);
    if (!f) return null;
    return { title: `Xyz materials of ${describe(viewer.uid)}`, cards: f.card.materials ?? [], at: () => f.at, host: f.card };
  };
  const vc = viewerCards();
  const closeViewer = () => { if (viewer?.kind === "peek") clearPeek(); setViewer(null); };

  const onViewerCard = (card: CardInstance, at: ZoneRef, host: CardInstance | undefined, e: MouseEvent) => {
    if (engineUi) {
      if (host) { if (card.code > 0) setZoomCard(card.code); return; }
      return engineBoard.onCard(card, at, e);
    }
    if (host) {
      if (you === null || (host.controller ?? at.player) !== you) return;
      const det = (zone: "gy" | "banished" | "hand") => act({ type: "detach", targetUid: host.uid, materialUid: card.uid, to: { zone } });
      setMenu({
        x: e.clientX, y: e.clientY, title: getCard(card.code)?.name ?? "Material",
        items: [
          { label: "Detach (to GY)", run: () => det("gy") },
          { label: "Detach and banish", run: () => det("banished") },
          { label: "Detach to hand", run: () => det("hand") },
          { label: "View card", run: () => setZoomCard(card.code) },
        ],
      });
      return;
    }
    cardMenu(card, at, e.clientX, e.clientY);
  };

  return (
    <section className={`duel-page ${live ? "is-live" : ""} ${drawer ? "is-drawer-open" : ""} ${tilt ? "is-tilt" : ""} ${nothingToDo ? "is-nothing-to-do" : ""}`} ref={anim.rootRef}
      style={{ ["--tilt" as string]: `${ds.tilt}deg` }}
      data-phase={live && board ? board.phase : undefined}>
      <div className="duel-topline">
        <Link to="/lobby" className="duel-back">‹ Lobby</Link>
        <h1>{room?.name ?? "Duel"}</h1>
        {room && <span className={`duel-chip ${room.mode === "engine" ? "is-beta" : ""}`}>{room.mode === "engine" ? "Rules-enforced" : "Manual"}</span>}
        {you === null && <span className="duel-chip">Spectating</span>}
        <span className="muted duel-topline-meta">
          {conn.status !== "open" ? (conn.status === "connecting" ? "Connecting…" : "Reconnecting…") : session ? `${session.spectators} watching` : ""}
        </span>
        {live && (
          <button className="duel-drawer-btn" onClick={() => setDrawer((d) => !d)} aria-expanded={drawer} title="Duel log and chat">
            Log &amp; chat{unread > 0 && !drawer && <span className="duel-unread">{unread > 99 ? "99+" : unread}</span>}
          </button>
        )}
        {live && playing && (
          <button className="is-danger duel-concede" onClick={() => { if (confirm("Concede this duel?")) send({ t: "concede" }); }} title="Concede the duel">Concede</button>
        )}
        {room?.mode === "engine" && you !== null && (
          <span className={`duel-autopilot ${auto.on ? "is-on" : ""}`}>
            <button onClick={() => setAutopilot(!auto.on)} aria-pressed={auto.on}
              title="Autopilot: your side plays itself (random legal moves that favour summons, effects and attacks), so you can watch a whole duel">
              {auto.on ? "■ Autopilot on" : "▶ Autopilot"}
            </button>
            {auto.on && (
              <select value={auto.speed} onChange={(e) => setSpeed(e.target.value as Speed)} aria-label="Demo speed">
                <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
              </select>
            )}
          </span>
        )}
        <SkinPicker />
        <MuteToggle />
        <DuelSettingsButton autoPass={autoPass} setAutoPass={setAutoPass} engine={room?.mode === "engine"} />
        <button className="duel-help-btn" onClick={() => setHelp(true)} aria-label="Help and shortcuts">?</button>
      </div>
      {session && live && <ReconnectOverlay status={conn.status} />}

      {!session ? <p className="muted">Connecting to the room…</p> : !live ? (
        <div className="duel-layout is-preduel">
          <PreDuel session={session} you={you} hasIdentity={!!identity} decks={decks} deckId={deckId} setDeckId={setDeckId} deck={deck} send={send} />
          <aside className="duel-side">
            <LogChat initialTab="chat" log={[]} chat={conn.chat} canChat={!!identity} onChat={(text) => send({ t: "chat", text })} onHover={setPreview} />
          </aside>
        </div>
      ) : (
        <div className="duel-layout">
          <div className="duel-main">
            <PendulumStrip board={board!} player={other(me)} ui={ui} />
            <Board board={board!} ui={ui}
              top={<PlayerBar board={board!} player={other(me)} you={you} onLp={engineMode ? undefined : setLpFor} onLpChange={onLpChange} connected={session.seats[other(me)]?.connected} timer={session.timer} startLp={session.settings?.startingLP} duelNo={duelNo} />}
              bottom={<PlayerBar board={board!} player={me} you={you} onLp={engineMode ? undefined : setLpFor} onLpChange={onLpChange} connected={session.seats[me]?.connected} timer={session.timer} startLp={session.settings?.startingLP} duelNo={duelNo} />}
              rail={phaseCtl && <>
                <PhaseTrack board={board!} controls={phaseCtl} go={goPhase} />
                {you !== null && <NextPhaseButton controls={phaseCtl} go={goPhase} />}
                <RecentFeed log={board!.log} onHover={onHoverCard} onOpen={() => setDrawer(true)} />
              </>}
              status={<>
                {engineMode && <ChainStack chain={chain} you={you} names={[board!.players[0].name, board!.players[1].name]} />}
                {nothingToDo && !auto.on && (
                  <p className="duel-nothing" role="status">Nothing left to play. Move on: <b>Next phase</b> <kbd>N</kbd> or <b>End turn</b> <kbd>E</kbd></p>
                )}
                {phaseCtl && session.stage === "duel" && (
                  <MoveStatus board={board!} you={you}
                    move={engineMode
                      ? (you === null ? null : engineBoard.yourMove ? { mine: true, text: "Your move" } : { mine: false, text: `Waiting for ${waitingName}…` })
                      : (board!.turnPlayer === you ? { mine: true, text: "Your turn" } : null)} />
                )}
                {playing && engineMode && (
                  <div className="duel-engine">
                    {conn.hostStatus && <p className="duel-engine-wait" role="status">{conn.hostStatus}</p>}
                    {session.engineHost !== undefined && session.engineHost !== you && !session.seats[session.engineHost]?.connected && (
                      <p className="duel-engine-wait" role="status">{session.seats[session.engineHost]?.name ?? "The host"} is disconnected. Their browser runs the rules, so the duel continues when they're back.</p>
                    )}
                    {conn.prompt && engineBoard.status && <p className={`duel-engine-status ${conn.prompt.hint ? "is-hint" : ""}`} role="status">{engineBoard.status}</p>}
                  </div>
                )}
              </>}
              corner={playing && <>
                <div className="duel-tools">
                  {!engineMode && <>
                    <button onClick={() => act({ type: "draw" })} title="Draw (D)">Draw</button>
                    <button onClick={() => act({ type: "dice" })}>Die</button>
                    <button onClick={() => act({ type: "coin" })}>Coin</button>
                    <button onClick={() => act({ type: "token", position: "atk" })}>Token</button>
                    <button onClick={() => act({ type: "revealHand" })}>Reveal hand</button>
                    <button onClick={() => setLpFor(other(me))}>LP…</button>
                  </>}
                  {board!.players[me].hand.length > 1 && <button onClick={shuffleHand} title="Shuffle the cards in your hand">Shuffle hand</button>}
                  {/* no manual switch against a bot (it can't agree) */}
                  {engineMode && !session.seats.some((x) => (x as { bot?: boolean } | null)?.bot) && (
                    <button disabled={session.switchVotes?.[me]} onClick={() => send({ t: "switchMode", mode: "manual" })}
                      title="If both players agree, the duel continues in manual mode from the current board.">
                      {session.switchVotes?.[me] ? "Waiting for opponent…" : session.switchVotes?.[other(me)] ? "Agree to manual" : "Switch to manual"}
                    </button>
                  )}
                  {/* narrow screens: concede lives here (the top bar holds it on PC) */}
                  <button className="is-danger duel-concede-narrow" onClick={() => { if (confirm("Concede this duel?")) send({ t: "concede" }); }}>Concede</button>
                </div>
                {phaseCtl && <EndTurnButton controls={phaseCtl} go={goPhase} />}
              </>} />
            <PendulumStrip board={board!} player={me} ui={ui} />
            {session.stage === "finished" && (
              <div className="duel-finished">
                <PreDuel session={session} you={you} hasIdentity={!!identity} decks={decks} deckId={deckId} setDeckId={setDeckId} deck={deck} send={send} />
              </div>
            )}
          </div>
          <div className={`duel-floatpreview ${hovering && preview ? "is-shown" : ""} ${previewRight ? "is-right" : ""}`} aria-hidden={!hovering}>
            <CardPreview code={preview} onZoom={(code) => setZoomCard(code)} />
          </div>
          <aside className="duel-side">
            <CardPreview code={preview} onZoom={(code) => setZoomCard(code)} />
            <LogChat log={board!.log} chat={conn.chat} canChat={!!identity} onChat={(text) => send({ t: "chat", text })} onHover={setPreview} />
          </aside>
        </div>
      )}

      {pending && (
        <div className="duel-pending" role="status">
          <span>{pending.label}</span>
          {pending.kind === "attack" && <button className="primary" onClick={() => { act({ type: "attack", uid: pending.uid, targetUid: null }); setPending(null); }}>Direct attack</button>}
          <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}

      {vc && (
        <Modal title={vc.title} onClose={closeViewer} wide>
          {vc.cards.length === 0 ? <p className="muted">No cards.</p> : (
            <div className="duel-viewer-grid">
              {vc.cards.map((c, i) => (
                <CardView key={c.uid} card={{ ...c, faceUp: c.faceUp || c.code > 0 }} onHover={setPreview}
                  mark={engineUi ? (engineBoard.marks.actionable.has(c.uid) ? "actionable" : engineBoard.marks.selectable.has(c.uid) ? "selectable" : undefined) : undefined}
                  onClick={(e) => onViewerCard(c, vc.at(i), vc.host, e)} />
              ))}
            </div>
          )}
          {viewer?.kind === "peek" && you !== null && (
            <div className="duel-modal-actions">
              <button onClick={() => { act({ type: "shuffle" }); closeViewer(); }}>Shuffle and close</button>
              <button onClick={closeViewer}>Close</button>
            </div>
          )}
        </Modal>
      )}

      {lpFor !== null && board && <LpDialog board={board} initial={lpFor} you={you} onClose={() => setLpFor(null)} act={act} />}

      {zoomCard !== null && (
        <Modal title={getCard(zoomCard)?.name ?? "Card"} onClose={() => setZoomCard(null)}>
          <CardPreview code={zoomCard} large />
        </Modal>
      )}

      {help && (
        <Modal title={engineMode ? "How to play (rules-enforced)" : "How to play (manual mode)"} onClose={() => setHelp(false)}>
          {engineMode ? (
            <ul className="duel-help">
              <li>Cards you can use right now glow. Click (or tap) one for its legal actions: summon, Set, activate, change position, attack.</li>
              <li>Drag a glowing card from your hand onto a zone to play it there when only one action fits.</li>
              <li>Move to the Battle Phase, Main Phase 2 or end your turn with the phase bar under the board.</li>
              <li>When the rules ask you to choose (targets, Tributes, zones, chains), the choices light up on the board and a bar at the bottom shows what to pick. Glowing piles (GY, Deck…) open to show their choices. "List" shows the same choice as a list.</li>
              <li>The rules engine enforces everything; both players can agree to switch the duel to manual mode.</li>
              <li>Shortcuts: <kbd>Z</kbd> zoom the card you're hovering, <kbd>Enter</kbd> confirm a selection, <kbd>Esc</kbd> cancel / don't chain / close, <kbd>Space</kbd> end your turn (or pass on a chain), <kbd>?</kbd> this help. Hover a card (long-press on touch) to read it; click the big preview to zoom.</li>
            </ul>
          ) : (
          <ul className="duel-help">
            <li>Click (or tap) a card for everything you can do with it. Right-click works too.</li>
            <li>Drag cards between zones: hand → Monster Zone summons, → S/T Zone sets a Trap / activates a Spell, onto a monster attaches it as Xyz material.</li>
            <li>Click a GY, banished pile or Extra Deck to look through it; click your Deck to draw, search, mill or shuffle.</li>
            <li>The server does not enforce the rules: agree with your opponent like on a real table. Everything is logged.</li>
            <li>Shortcuts: <kbd>Z</kbd> zoom the hovered card, <kbd>D</kbd> draw, <kbd>H</kbd> shuffle, <kbd>N</kbd> next phase, <kbd>E</kbd> end turn, <kbd>Esc</kbd> cancel, <kbd>?</kbd> this help.</li>
          </ul>
          )}
        </Modal>
      )}

      {engineUi && engineBoard.overlay}
      {live && board && <TurnBanner board={board} you={you} />}
      {endShown && session?.stage === "finished" && (
        <EndOverlay session={session} you={you} onRematch={() => send({ t: "rematch" })} onClose={() => setEndShown(false)} />
      )}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      <Toasts toasts={conn.toasts} names={names} describe={describe} />
    </section>
  );
}

function PlayerBar({ board, player, you, onLp, onLpChange, connected, timer, startLp = 8000, duelNo = 0 }: {
  board: NonNullable<ReturnType<typeof useDuelSocket>["conn"]["board"]>; player: Seat; you: Seat | null;
  timer?: TurnClock; startLp?: number; duelNo?: number;
  /** Manual mode: click the LP to change it (rules-enforced LP only change through the rules). */
  onLp?: (p: Seat) => void; onLpChange?: (delta: number) => void; connected?: boolean;
}) {
  const pb = board.players[player];
  const turn = board.turnPlayer === player;
  const [hit, setHit] = useState<"" | "is-hit" | "is-heal">("");
  const lpChanged = (d: number) => {
    onLpChange?.(d);
    setHit(d < 0 ? "is-hit" : "is-heal");
    setTimeout(() => setHit(""), 650);
  };
  return (
    <div className={`duel-playerbar ${turn ? "is-turn" : ""} ${player === you ? "is-you" : ""} ${hit}`} data-seat={player}>
      <span className="duel-avatar" aria-hidden="true">
        {(pb.name.trim()[0] ?? "?").toUpperCase()}
        <span className={`duel-dot ${connected === false ? "is-off" : "is-on"}`} title={connected === false ? "Disconnected" : "Connected"} />
      </span>
      <span className="duel-pinfo">
        <b className="duel-pname">{pb.name}{player === you ? " (you)" : ""}</b>
        <span className="duel-lpbar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, (pb.lp / startLp) * 100))}%` }} /></span>
        <span className="muted duel-pcounts">
          <span title="Cards in hand">✋ {pb.hand.length}</span>
          <span title="Cards in Deck">🂠 {pb.deck.length}</span>
          {turn && <span className="duel-chip is-turn">Turn {board.turn}</span>}
          <span className="duel-timer-slot">{timer && <TurnTimer timer={timer} seat={player} label={player === you ? "Your time" : `${pb.name}'s time`} />}</span>
        </span>
      </span>
      <button className={`duel-lp ${pb.lp <= 2000 ? "is-low" : ""}`} onClick={onLp ? () => onLp(player) : undefined} disabled={you === null || !onLp} title={onLp ? "Change LP" : "Life Points"}>
        <span>LP</span> <AnimatedLp key={duelNo} value={pb.lp} onChange={lpChanged} />
      </button>
    </div>
  );
}

const PHASE_SHORT_LABEL = PHASE_SHORT;

/** The DP·SP·M1·BP·M2·EP track, drawn on the board between the two Extra Monster Zones. */
function PhaseTrack({ board, controls, go }: { board: BoardState; controls: PhaseControls; go(target: Phase | "endTurn"): void }) {
  return (
    <div className="duel-phasetrack" role="group" aria-label={`Turn ${board.turn}, ${PHASE_LABEL[board.phase]}`}>
      <span className="duel-phasetrack-turn" title={`Turn ${board.turn}`}>T{board.turn}</span>
      {controls.phases.map((p) => (
        <button key={p.phase} className={`${p.current ? "is-active" : ""} ${p.past ? "is-past" : ""} ${p.enabled ? "is-next" : ""}`}
          disabled={!p.enabled} title={`${PHASE_LABEL[p.phase]}: ${p.hint}`} onClick={() => go(p.phase)}>
          {PHASE_SHORT_LABEL[p.phase]}
        </button>
      ))}
    </div>
  );
}

/** What just happened: the last few log lines, on the board (the full log is in the drawer). */
function RecentFeed({ log, onHover, onOpen }: { log: string[]; onHover(code: number | null): void; onOpen(): void }) {
  // skip phase-step noise so the feed shows actions
  const lines = log.filter((l) => !/^(Draw|Standby|Main|Battle|End) Phase( \d)?$/.test(l)).slice(-4);
  if (!lines.length) return null;
  return (
    <div className="duel-recent" role="log" aria-label="Recent actions">
      <button className="duel-recent-title" onClick={onOpen} title="Open the full duel log">Recent ›</button>
      <ol>
        {lines.map((l, i) => <li key={`${log.length}-${i}`} className={i === lines.length - 1 ? "is-new" : ""} style={{ opacity: 0.45 + (0.55 * (i + 1)) / lines.length }}><LogText text={l} onHover={onHover} /></li>)}
      </ol>
    </div>
  );
}

/** Whose decision it is (left of the phase track). */
function MoveStatus({ board, you, move }: { board: BoardState; you: Seat | null; move?: { mine: boolean; text: string } | null }) {
  const mine = board.turnPlayer === you;
  return move ? <span className={`duel-move ${move.mine ? "is-mine" : "is-wait"}`} role="status">{move.text}</span>
    : <span className="duel-move is-wait">{mine ? "Your turn" : `${board.players[board.turnPlayer].name}'s turn`}</span>;
}

/** Next phase, right of the phase track (away from End turn). */
function NextPhaseButton({ controls, go }: { controls: PhaseControls; go(target: Phase | "endTurn"): void }) {
  return (
    <button className="duel-next-phase" disabled={!controls.next} onClick={() => controls.next && go(controls.next)}
      title={controls.next ? `Next phase: ${PHASE_LABEL[controls.next]} (N)` : "No next phase right now"}>
      Next phase{controls.next ? <small>{PHASE_LABEL[controls.next]}</small> : null}
    </button>
  );
}

/** End turn, in your corner of the board. */
function EndTurnButton({ controls, go }: { controls: PhaseControls; go(target: Phase | "endTurn"): void }) {
  return <button className="primary duel-end-turn" disabled={!controls.endTurn.enabled} onClick={() => go("endTurn")} title={`${controls.endTurn.hint} (E)`}>End turn</button>;
}

function LpDialog({ board, initial, you, onClose, act }: { board: NonNullable<ReturnType<typeof useDuelSocket>["conn"]["board"]>; initial: Seat; you: Seat | null; onClose(): void; act(a: DuelAction): void }) {
  const [player, setPlayer] = useState<Seat>(initial);
  const [amount, setAmount] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const n = Math.trunc(Number(amount));
  const ok = Number.isFinite(n) && n > 0;
  const go = (a: DuelAction) => { act(a); onClose(); };
  const lp = board.players[player].lp;
  const quick = useMemo(() => [500, 1000, 2000], []);
  if (you === null) return null;
  return (
    <Modal title="Change LP" onClose={onClose}>
      <div className="duel-lpdialog">
        <div className="duel-seg" role="radiogroup">
          {([0, 1] as Seat[]).map((p) => (
            <button key={p} role="radio" aria-checked={player === p} className={player === p ? "is-active" : ""} onClick={() => setPlayer(p)}>
              {board.players[p].name}{p === you ? " (you)" : ""}: {board.players[p].lp}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (ok) go({ type: "lp", player, delta: -n }); }}>
          <input ref={inputRef} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="Amount" aria-label="LP amount" />
          <div className="duel-lp-actions">
            <button type="submit" className="is-danger" disabled={!ok}>− Damage / pay</button>
            <button type="button" disabled={!ok} onClick={() => go({ type: "lp", player, delta: n })}>+ Gain</button>
            <button type="button" disabled={!ok} onClick={() => go({ type: "lp", player, set: n })}>Set to</button>
          </div>
        </form>
        <div className="duel-lp-actions">
          {quick.map((q) => <button key={q} onClick={() => go({ type: "lp", player, delta: -q })}>−{q}</button>)}
          <button onClick={() => go({ type: "lp", player, set: Math.ceil(lp / 2) })} disabled={lp <= 1}>Halve</button>
        </div>
      </div>
    </Modal>
  );
}
