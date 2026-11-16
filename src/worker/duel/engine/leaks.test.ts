// Hidden-information leak test. Plays full bot duels and, for each player in turn, collects EVERYTHING the
// room sends them (the masked board, their engine events, the log, the "X is choosing: ..." line for the
// other player's decisions, the public chain) and fails if any of it names or identifies a card that player
// can't know: the opponent's hand, Deck, Extra Deck or face-down cards, unless they were publicly revealed.
//
// What a player legitimately knows: their own cards (they know their own deck list), anything that has
// ever been visible on their masked board, and cards revealed to them (confirm events meant for them,
// selections from the opponent's Deck that the rules let them see).
import { describe, expect, it } from "vitest";
import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { EngineEvent, EnginePrompt, Seat } from "../../../shared/enginePrompts.ts";
import { STARTER_DECKS } from "../../../shared/starterDecks.ts";
import type { OpenChainLink } from "../../../shared/chain.ts";
import { maskBoard } from "../manual/mask.ts";
import { botResponse, seededRng } from "./bot.ts";
import { clearEngineCaches } from "./data.ts";
import { publicChain, publicDeciding } from "./publicView.ts";
import { eventsFor } from "./EngineDuel.ts";
import { startRoomSession, type RoomEngineUpdate } from "./roomSession.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const deps = { core: nodeCore, data: () => nodeData().data };
const deck = (id: string) => STARTER_DECKS.find((d) => d.id === `starter:${id}`)!;
const MATCHES: [string, string][] = [["kewl", "branded"], ["branded", "kewl"], ["warrior", "synchro"], ["xyz", "dragon"]];

function cardsOf(b: BoardState, seat: Seat): CardInstance[] {
  const p = b.players[seat];
  const field = [...p.monster, ...p.spelltrap, p.field, ...(p.pendulum ?? [])].filter((c): c is CardInstance => !!c);
  const emz = b.extraMonster.filter((c): c is CardInstance => !!c && (c.controller ?? c.owner) === seat);
  const all = [...p.hand, ...p.deck, ...p.extra, ...p.gy, ...p.banished, ...field, ...emz];
  return [...all, ...all.flatMap((c) => c.materials ?? [])];
}
const allCodes = (b: BoardState) => new Set([...cardsOf(b, 0), ...cardsOf(b, 1)].map((c) => c.code).filter((c) => c > 0));

/** Every card code mentioned in a value (events, chain links): any `code`/`codes` field. */
function codesIn(v: unknown, out: number[] = []): number[] {
  if (Array.isArray(v)) { v.forEach((x) => codesIn(x, out)); return out; }
  if (!v || typeof v !== "object") return out;
  for (const [k, x] of Object.entries(v)) {
    if ((k === "code" || k === "from") && typeof x === "number" && x > 0) out.push(x);
    else if (k === "codes" && Array.isArray(x)) out.push(...x.filter((c): c is number => typeof c === "number" && c > 0));
    else codesIn(x, out);
  }
  return out;
}

interface Leak { duel: number; step: number; viewer: Seat | "spectator"; where: string; detail: string }

describe.skipIf(!engineDataAvailable)("no hidden information reaches the other player or a spectator", () => {
  it(`checks everything sent to each player (${MATCHES.length} duels)`, async () => {
    clearEngineCaches();
    const { data } = nodeData();
    const name = (code: number) => data.row(code)?.name ?? "";
    const leaks: Leak[] = [];
    let rawHintLeaks = 0;   // what the old "is choosing: <hint>" line would have leaked (proves the check bites)

    for (const [m, [a, b]] of MATCHES.entries()) {
      const A = deck(a), B = deck(b);
      const s = startRoomSession(deps, {
        names: ["Ann", "Bob"], decks: [{ main: A.main, extra: A.extra }, { main: B.main, extra: B.extra }] as never,
        first: (m % 2) as Seat, seed: new Uint32Array([m + 1, 2, 3, 4, 5, 6, 7, 8 + m]),
      });
      let u: RoomEngineUpdate = await s.start();
      const rng = seededRng(900 + m);
      const known: [Set<number>, Set<number>] = [new Set(), new Set()];
      const specKnown = new Set<number>();   // a spectator: only what has been public
      let chain: OpenChainLink[] = [];
      // own deck lists are known from the start
      for (const v of [0, 1] as Seat[]) for (const c of [...(v === 0 ? A : B).main, ...(v === 0 ? A : B).extra]) known[v].add(c);

      for (let step = 0; step < 2500 && !u.finished; step++) {
        const full = u.board!;
        if (u.events) chain = publicChain(chain, u.events);
        for (const v of [0, 1] as Seat[]) {
          const masked = maskBoard(full, v);
          for (const c of allCodes(masked)) known[v].add(c);
          // revealed to v: confirms v may see, prompts put to v (their codes are what the rules let v see)
          for (const e of u.events?.[v] ?? []) if (e.e === "confirm" && (e.public || e.player === v)) e.cards.forEach((c) => c.code > 0 && known[v].add(c.code));
          for (const p of u.prompts ?? []) if (p.seat === v) codesIn(p.prompt).forEach((c) => known[v].add(c));
          // cards v can't know right now: anything on the full board not known to v
          const secret = new Set([...allCodes(full)].filter((c) => !known[v].has(c)));
          if (!secret.size) continue;
          const secretNames = [...secret].map((c) => [c, name(c)] as const).filter(([, n]) => n && ![...known[v]].some((k) => name(k) === n));
          const say = (where: string, detail: string) => leaks.push({ duel: m, step, viewer: v, where, detail });

          // 1. the engine events sent to v
          for (const e of u.events?.[v] ?? []) for (const c of codesIn(e)) if (secret.has(c)) say("events", `${e.e}: ${name(c)} (${c}) ${JSON.stringify(e).slice(0, 400)}`);
          // 2. the public log
          for (const line of u.log ?? []) {
            for (const [, code] of line.matchAll(/\[\[(\d+)\]\]/g)) if (secret.has(+code)) say("log", line);
            for (const [, n] of secretNames) if (line.includes(n)) say("log", line);
          }
          // 3. "X is choosing: ..." for the other player's decision
          const others = (u.prompts ?? []).filter((p) => p.seat !== v);
          const deciding = publicDeciding(others);
          for (const [, n] of secretNames) {
            if (deciding?.hint?.includes(n)) say("deciding", deciding.hint);
            const raw = (others[0]?.prompt as EnginePrompt | undefined)?.hint;
            if (raw?.includes(n)) rawHintLeaks++;
          }
          // 4. the public chain
          for (const c of codesIn(chain)) if (secret.has(c)) say("chain", `${name(c)} (${c})`);
        }
        // a spectator: the board with both hands hidden, and the public events (what the room sends them)
        {
          for (const c of allCodes(maskBoard(full, null))) specKnown.add(c);
          const pub = u.events ? eventsFor(u.events[0], 1) : [];
          for (const e of pub) if (e.e === "confirm" && e.public) e.cards.forEach((c) => c.code > 0 && specKnown.add(c.code));
          const secret = new Set([...allCodes(full)].filter((c) => !specKnown.has(c)));
          const secretNames = [...secret].map((c) => [c, name(c)] as const).filter(([, n]) => n && ![...specKnown].some((k) => name(k) === n));
          const say = (where: string, detail: string) => leaks.push({ duel: m, step, viewer: "spectator", where, detail });
          for (const e of pub) for (const c of codesIn(e)) if (secret.has(c)) say("events", `${e.e}: ${name(c)} (${c}) ${JSON.stringify(e).slice(0, 300)}`);
          for (const line of u.log ?? []) {
            for (const [, code] of line.matchAll(/\[\[(\d+)\]\]/g)) if (secret.has(+code)) say("log", line);
            for (const [, n] of secretNames) if (line.includes(n)) say("log", line);
          }
          const deciding = publicDeciding(u.prompts ?? []);
          for (const [, n] of secretNames) if (deciding?.hint?.includes(n)) say("deciding", deciding.hint);
          for (const c of codesIn(chain)) if (secret.has(c)) say("chain", `${name(c)} (${c})`);
        }
        const p = u.prompts![0];
        u = await s.respond(p.seat, botResponse(p.prompt, rng));
      }
    }
    const sample = leaks.slice(0, 12).map((l) => `duel ${l.duel} step ${l.step} viewer ${l.viewer} [${l.where}] ${l.detail}`).join("\n");
    expect(leaks.length, `hidden information leaked:\n${sample}`).toBe(0);
    expect(rawHintLeaks, "the check should notice card names in hints (the old 'is choosing' line)").toBeGreaterThan(0);
  }, 600_000);
});
