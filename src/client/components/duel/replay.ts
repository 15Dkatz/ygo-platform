// Replays: the duel page records every board update (with the engine events that led to it) and keeps the
// last few duels in this browser (IndexedDB, gzip-compressed). The replay page plays them back on the same
// board with the same animations. Only what this viewer saw is recorded (boards arrive masked).
import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { EngineEvent, Seat } from "../../../shared/enginePrompts.ts";

export interface ReplayFrame {
  /** the board without its log (the log is stored once, `logLen` lines of it are shown at this frame) */
  board: Omit<BoardState, "log">;
  logLen: number;
  events: EngineEvent[] | null;
  /** ms since the duel started */
  t: number;
}
export interface Replay {
  id: string;
  savedAt: string;
  names: [string, string];
  you: Seat | null;
  sleeves: [string | undefined, string | undefined];
  rarity: [Record<string, string> | undefined, Record<string, string> | undefined];
  winner: Seat | null;
  reason?: string;
  log: string[];
  frames: ReplayFrame[];
}
export interface ReplayMeta { id: string; savedAt: string; names: [string, string]; you: Seat | null; winner: Seat | null; turns: number; frames: number }

const DB = "ygo-replays", STORE = "replays", META = "meta", KEEP = 15;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); r.result.createObjectStore(META); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const tx = <T,>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => { const t = db.transaction(store, mode); const q = fn(t.objectStore(store)); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });

async function gzip(text: string): Promise<Blob> {
  if (typeof CompressionStream === "undefined") return new Blob([text]);
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
}
async function gunzip(b: Blob): Promise<string> {
  try { return await new Response(b.stream().pipeThrough(new DecompressionStream("gzip"))).text(); } catch { return b.text(); }
}

/** Records one duel (create one per duel; `add` for every board update; `save` at the end). */
export class ReplayRecorder {
  private frames: ReplayFrame[] = [];
  private start = Date.now();
  add(board: BoardState, events: EngineEvent[] | null) {
    if (this.frames.length > 4000) return;   // a runaway duel: stop recording
    const { log, ...rest } = board;
    // boards are immutable snapshots from the server; strip the log, keep the rest as is
    this.frames.push({ board: rest, logLen: log.length, events: events?.length ? events : null, t: Date.now() - this.start });
  }
  get size() { return this.frames.length; }
  get recorded(): ReplayFrame[] { return this.frames; }
}

/** Save a finished duel; returns its id (null when it can't be stored). */
export async function saveReplay(rec: ReplayRecorder, meta: Omit<Replay, "id" | "savedAt" | "frames" | "log">, finalBoard: BoardState): Promise<string | null> {
  if (rec.size < 2 || typeof indexedDB === "undefined") return null;
  const r = { frames: rec.recorded };
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const replay: Replay = { ...meta, id, savedAt: new Date().toISOString(), log: finalBoard.log, frames: r.frames };
  try {
    const blob = await gzip(JSON.stringify(replay));
    const db = await open();
    await tx(db, STORE, "readwrite", (s) => s.put(blob, id));
    const m: ReplayMeta = { id, savedAt: replay.savedAt, names: meta.names, you: meta.you, winner: meta.winner, turns: finalBoard.turn, frames: r.frames.length };
    await tx(db, META, "readwrite", (s) => s.put(m, id));
    // keep the newest KEEP
    const all = await listReplays();
    for (const old of all.slice(KEEP)) { await tx(db, STORE, "readwrite", (s) => s.delete(old.id)); await tx(db, META, "readwrite", (s) => s.delete(old.id)); }
    return id;
  } catch { return null; }
}

export async function listReplays(): Promise<ReplayMeta[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await open();
    const all = await tx(db, META, "readonly", (s) => s.getAll() as IDBRequest<ReplayMeta[]>);
    return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch { return []; }
}

export async function loadReplay(id: string): Promise<Replay | null> {
  try {
    const db = await open();
    const blob = await tx(db, STORE, "readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
    return blob ? (JSON.parse(await gunzip(blob)) as Replay) : null;
  } catch { return null; }
}

/** The board at a frame (with its log as it was then). */
export const frameBoard = (r: Replay, i: number): BoardState => ({ ...(r.frames[i].board as BoardState), log: r.log.slice(0, r.frames[i].logLen) });

export type { CardInstance };
