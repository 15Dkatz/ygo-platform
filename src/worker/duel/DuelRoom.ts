import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.ts";
import type {
  BoardState, ClientMsg, DuelStage, RoomInfo, RpsChoice, ServerMsg, SessionInfo,
} from "../../shared/duel.ts";
import type { DuelMode } from "../../shared/types.ts";
import { validateDeck, type DuelAction, type Seat } from "../../shared/duelActions.ts";
import { cryptoRng, createBoard } from "./manual/board.ts";
import { ActionError, applyAction } from "./manual/reducer.ts";
import { maskBoard } from "./manual/mask.ts";
import { identityFromHeaders } from "./identity.ts";
import { ENGINE_NOTICE, engineAvailable } from "./engineHook.ts";

/**
 * One duel room. PHASE 3 implements manual mode (shared board state, players move cards
 * themselves). PHASE 4 adds engine mode (ocgcore WASM enforces the rules). The room's
 * mode is fixed when it is created; players can switch an engine duel to manual.
 *
 * Uses the WebSocket Hibernation API: sockets carry their identity/seat in an attachment and
 * the whole room (seats, stage, board) lives in DO storage under "room", so a hibernated or
 * restarted object resumes the duel exactly. Engine mode plugs in through ./engineHook.ts
 * (see `startDuel` and the "respond" / "switchMode" messages below).
 */

/** How long a disconnected player keeps their seat. */
export const SEAT_GRACE_MS = 5 * 60_000;
/** How long an empty room (nobody seated, nobody connected) lives. */
const EMPTY_ROOM_MS = 10 * 60_000;
const MAX_SOCKETS = 64;
const MAX_CHAT = 100;
const MAX_MSG_BYTES = 64 * 1024;
/** Clients send "ping" every 25 s (answered by the runtime without waking the object); silent sockets are dropped. */
const STALE_MS = 75_000;

interface SeatState {
  id: string;
  name: string;
  deck: { deckId: string; main: number[]; extra: number[]; side: number[] } | null;
  connected: boolean;
  leftAt: number | null;
}

interface ChatLine { from: string; text: string; at: number; system?: boolean }

interface RoomData {
  roomId: string;
  name: string;
  mode: DuelMode;
  host: string;
  created_at: string;
  stage: DuelStage;
  seats: [SeatState | null, SeatState | null];
  rps: [RpsChoice | null, RpsChoice | null];
  rpsLast?: { choices: [RpsChoice, RpsChoice]; winner: Seat | null };
  chooser: Seat | null;
  winner: Seat | null;
  endReason?: string;
  rematch: [boolean, boolean];
  switchVotes: [boolean, boolean];
  board: BoardState | null;
  chat: ChatLine[];
}

interface Attachment { id: string | null; name: string; seat: Seat | null; since?: number }

const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const BEATS: Record<RpsChoice, RpsChoice> = { rock: "scissors", paper: "rock", scissors: "paper" };

export class DuelRoom extends DurableObject<Env> {
  private room: RoomData | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomData>("room")) ?? null;
    });
  }

  // ---------- RPC from the Worker ----------

  async init(info: { roomId: string; name: string; mode: DuelMode; host: string }): Promise<void> {
    if (this.room) throw new Error("room already exists");
    this.room = {
      ...info, created_at: new Date().toISOString(), stage: "lobby", seats: [null, null], rps: [null, null],
      chooser: null, winner: null, rematch: [false, false], switchVotes: [false, false], board: null, chat: [],
    };
    await this.save();
    await this.updateIndex();
    await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_MS);
  }

  // ---------- WebSocket entry ----------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const room = this.room;
    if (!room) {
      server.accept();
      server.send(JSON.stringify({ t: "error", message: "Room not found. It may have closed." } satisfies ServerMsg));
      server.close(4404, "room not found");
      return new Response(null, { status: 101, webSocket: client });
    }
    await this.pruneStale();
    if (this.live().length >= MAX_SOCKETS) {
      server.accept();
      server.send(JSON.stringify({ t: "error", message: "This room is full." } satisfies ServerMsg));
      server.close(4429, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const ident = identityFromHeaders(request);
    const seatIdx = ident ? room.seats.findIndex((s) => s?.id === ident.id) : -1;
    const seat = seatIdx >= 0 ? (seatIdx as Seat) : null;
    if (seat !== null) {
      // same player in another tab: the newest connection takes over the seat
      for (const ws of this.ctx.getWebSockets()) {
        const a = this.att(ws);
        if (a.seat === seat) {
          a.seat = null;
          ws.serializeAttachment(a);
          this.send(ws, { t: "error", message: "You opened this duel in another tab; this tab is now spectating." });
        }
      }
      const s = room.seats[seat]!;
      const wasAway = !s.connected;
      s.connected = true;
      s.leftAt = null;
      if (wasAway && room.stage === "duel") this.systemLine(`${s.name} reconnected.`);
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: ident?.id ?? null, name: ident?.name ?? "Anonymous", seat, since: Date.now() } satisfies Attachment);

    this.send(server, { t: "room", room: this.roomInfo(), you: seat });
    this.send(server, { t: "session", session: this.session(seat) });
    if (room.board) this.send(server, { t: "state", state: maskBoard(room.board, seat) });
    for (const line of room.chat) this.send(server, { t: "chat", ...line });
    await this.save();
    this.broadcastSession();
    await this.updateIndex();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room) return;
    if (typeof raw !== "string" || raw.length > MAX_MSG_BYTES) return this.send(ws, { t: "error", message: "Message too large." });
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.send(ws, { t: "error", message: "Bad message." });
    }
    try {
      await this.handle(ws, msg);
    } catch (e) {
      if (e instanceof ActionError || e instanceof RoomError) this.send(ws, { t: "error", message: e.message });
      else {
        console.error("DuelRoom error", e);
        this.send(ws, { t: "error", message: "Something went wrong in the room." });
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye"); } catch { /* already closed */ }
    await this.onLeave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onLeave(ws);
  }

  private async onLeave(ws: WebSocket) {
    const room = this.room;
    if (!room) return;
    const a = this.att(ws);
    if (a.seat !== null) {
      const stillHere = this.live().some((w) => w !== ws && this.att(w).seat === a.seat);
      const s = room.seats[a.seat];
      if (s && !stillHere) {
        s.connected = false;
        s.leftAt = Date.now();
        if (room.stage === "duel") this.systemLine(`${s.name} disconnected. Their seat is kept for ${SEAT_GRACE_MS / 60_000} minutes.`);
      }
    }
    await this.save();
    this.broadcastSession(ws);
    await this.scheduleAlarm(ws);
    await this.updateIndex(ws);
  }

  /** Seat expiry and empty-room cleanup. */
  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    for (const p of [0, 1] as Seat[]) {
      const s = room.seats[p];
      if (!s || s.connected || s.leftAt === null || now - s.leftAt < SEAT_GRACE_MS) continue;
      if (room.stage === "duel") this.finish(other(p), `${s.name} left the duel.`);
      this.freeSeat(p);
      this.systemLine(`${s.name} left the room.`);
    }
    await this.pruneStale();
    const sockets = this.live().length;
    if (!room.seats[0] && !room.seats[1] && sockets === 0) {
      await this.closeRoom();
      return;
    }
    await this.save();
    this.broadcastAll();
    await this.updateIndex();
    await this.scheduleAlarm();
  }

  // ---------- messages ----------

  private async handle(ws: WebSocket, msg: ClientMsg) {
    const room = this.room!;
    const a = this.att(ws);
    switch (msg.t) {
      case "join": return this.join(ws, a, msg);
      case "chat": {
        if (!a.id) throw new RoomError("Pick a display name in the lobby to chat.");
        const text = String(msg.text ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300);
        if (!text) return;
        const line: ChatLine = { from: a.seat === null ? `${a.name} (spectator)` : a.name, text, at: Date.now() };
        this.pushChat(line);
        await this.save();
        return this.broadcast({ t: "chat", ...line });
      }
      case "rps": {
        const p = this.seated(a);
        if (room.stage !== "rps") throw new RoomError("Not choosing rock-paper-scissors right now.");
        if (!(msg.choice in BEATS)) throw new RoomError("Pick rock, paper or scissors.");
        room.rps[p] = msg.choice;
        const [c0, c1] = room.rps;
        if (c0 && c1) {
          const winner: Seat | null = c0 === c1 ? null : BEATS[c0] === c1 ? 0 : 1;
          room.rpsLast = { choices: [c0, c1], winner };
          room.rps = [null, null];
          const names = room.seats.map((s) => s!.name);
          if (winner === null) this.systemLine(`Rock-paper-scissors: both picked ${c0}. Pick again!`);
          else {
            this.systemLine(`Rock-paper-scissors: ${names[0]} ${c0}, ${names[1]} ${c1}. ${names[winner]} wins and chooses who goes first.`);
            room.stage = "choose";
            room.chooser = winner;
          }
        }
        break;
      }
      case "coinToss": {
        this.seated(a);
        if (room.stage !== "rps") throw new RoomError("Not deciding turn order right now.");
        const winner = cryptoRng.int(2) as Seat;
        room.rps = [null, null];
        room.stage = "choose";
        room.chooser = winner;
        this.systemLine(`${a.name} tossed a coin: ${winner === 0 ? "Heads" : "Tails"} — ${room.seats[winner]!.name} chooses who goes first.`);
        break;
      }
      case "chooseOrder": {
        const p = this.seated(a);
        if (room.stage !== "choose" || room.chooser !== p) throw new RoomError("It is not your choice to make.");
        await this.startDuel(msg.first ? p : other(p));
        return;
      }
      case "concede":
        return this.doAction(ws, a, { type: "concede" });
      case "action": {
        const action = msg.action as DuelAction;
        if (action?.type === "rematch") return this.rematch(a);
        return this.doAction(ws, a, action);
      }
      case "rematch": return this.rematch(a);
      case "leave": {
        const p = this.seated(a);
        const name = room.seats[p]!.name;
        if (room.stage === "duel") this.finish(other(p), `${name} left the duel.`);
        this.freeSeat(p);
        a.seat = null;
        ws.serializeAttachment(a);
        this.systemLine(`${name} left the seat.`);
        this.send(ws, { t: "room", room: this.roomInfo(), you: null });
        break;
      }
      case "switchMode": {
        const p = this.seated(a);
        if (msg.mode !== "manual") throw new RoomError("Only switching to manual mode is supported.");
        if (room.mode === "manual") throw new RoomError("This room is already in manual mode.");
        room.switchVotes[p] = true;
        this.systemLine(`${a.name} wants to play this room manually.`);
        if (room.switchVotes[0] && room.switchVotes[1]) {
          // PHASE 4: if an engine duel is running, take session.exportBoard() as room.board here.
          room.mode = "manual";
          room.switchVotes = [false, false];
          this.systemLine("Both players agreed: this room is now a manual duel.");
          this.advanceLobby();
          this.broadcast({ t: "room", room: this.roomInfo(), you: null }, (w) => this.att(w).seat);
        }
        break;
      }
      case "respond":
        // PHASE 4: forward to the engine session (engineHook.ts) and broadcast its EngineUpdate.
        throw new RoomError("Rules-enforced mode is not available yet.");
      default:
        throw new RoomError("Unknown message.");
    }
    await this.save();
    this.broadcastAll();
    await this.updateIndex();
  }

  private async join(ws: WebSocket, a: Attachment, msg: Extract<ClientMsg, { t: "join" }>) {
    const room = this.room!;
    if (!a.id) throw new RoomError("Pick a display name in the lobby before joining.");
    const err = validateDeck(msg);
    if (err) throw new RoomError(err);
    const deck = { deckId: String(msg.deckId ?? "").slice(0, 64), main: msg.main, extra: msg.extra, side: msg.side ?? [] };
    let seat = a.seat;
    if (seat === null) {
      if (room.stage !== "lobby" && room.stage !== "finished") throw new RoomError("This duel has already started — you can spectate.");
      const free = room.seats.findIndex((s) => s === null);
      if (free < 0) throw new RoomError("Both seats are taken — you can spectate.");
      seat = free as Seat;
      room.seats[seat] = { id: a.id, name: a.name, deck, connected: true, leftAt: null };
      a.seat = seat;
      ws.serializeAttachment(a);
      this.systemLine(`${a.name} took a seat.`);
      if (room.stage === "finished") this.resetToLobby();
    } else {
      if (room.stage !== "lobby" && room.stage !== "finished") throw new RoomError("You can only change decks between duels.");
      room.seats[seat]!.deck = deck;
      this.systemLine(`${a.name} ${room.stage === "finished" ? "side-decked / changed deck" : "changed deck"}.`);
    }
    this.advanceLobby();
    this.send(ws, { t: "room", room: this.roomInfo(), you: seat });
    await this.save();
    this.broadcastAll();
    await this.updateIndex();
  }

  /** lobby -> rps once both seats have decks (manual mode, or engine mode once the engine exists). */
  private advanceLobby() {
    const room = this.room!;
    if (room.stage !== "lobby") return;
    if (!room.seats[0]?.deck || !room.seats[1]?.deck) return;
    if (room.mode === "engine" && !engineAvailable()) return; // waiting for both to vote "play manually"
    room.stage = "rps";
    room.rps = [null, null];
    room.rpsLast = undefined;
    this.systemLine("Both players are ready. Rock-paper-scissors (or toss a coin) to decide who chooses turn order.");
  }

  private async startDuel(first: Seat) {
    const room = this.room!;
    const [s0, s1] = room.seats;
    if (!s0?.deck || !s1?.deck) throw new RoomError("Both players need a deck.");
    if (room.mode === "engine") {
      // PHASE 4 ENGINE HOOK: const session = startEngineDuel({ names, decks, first, seed }); store
      // session.snapshot() in storage, apply its first EngineUpdate and return.
      throw new RoomError("Rules-enforced mode is not available yet.");
    }
    room.board = createBoard([s0.name, s1.name], [s0.deck, s1.deck], first, cryptoRng);
    room.stage = "duel";
    room.chooser = null;
    room.winner = null;
    room.endReason = undefined;
    room.rematch = [false, false];
    this.systemLine(`The duel begins! ${room.seats[first]!.name} goes first.`);
    await this.save();
    this.broadcastAll();
    await this.updateIndex();
  }

  private async doAction(ws: WebSocket, a: Attachment, action: DuelAction) {
    const room = this.room!;
    const p = this.seated(a);
    if (room.stage !== "duel" || !room.board) throw new RoomError("The duel is not running.");
    if (room.mode !== "manual") throw new RoomError("Board actions are only for manual duels.");
    const r = applyAction(room.board, p, action, cryptoRng);
    room.board = r.board;
    if (r.finished) this.finish(r.finished.winner, r.finished.reason);
    await this.save();
    this.broadcastAll();
    if (r.peek) this.send(ws, { t: "peek", ...r.peek });
    for (const event of r.events) this.broadcast({ t: "event", event });
    if (r.finished) await this.updateIndex();
  }

  private async rematch(a: Attachment) {
    const room = this.room!;
    const p = this.seated(a);
    if (room.stage !== "finished") throw new RoomError("Rematch is offered when a duel ends.");
    if (!room.seats[0] || !room.seats[1]) throw new RoomError("Waiting for an opponent to sit down.");
    room.rematch[p] = true;
    this.systemLine(`${a.name} wants a rematch.`);
    if (room.rematch[0] && room.rematch[1]) {
      room.rematch = [false, false];
      room.rpsLast = undefined;
      if (room.winner === null) {
        room.stage = "rps";
        room.rps = [null, null];
        this.systemLine("Rematch! Rock-paper-scissors again.");
      } else {
        room.stage = "choose";
        room.chooser = other(room.winner); // the loser of the last duel picks
        this.systemLine(`Rematch! ${room.seats[room.chooser]!.name} lost the last duel and chooses who goes first.`);
      }
    }
    await this.save();
    this.broadcastAll();
    await this.updateIndex();
  }

  private finish(winner: Seat | null, reason: string) {
    const room = this.room!;
    room.stage = "finished";
    room.winner = winner;
    room.endReason = reason;
    room.rematch = [false, false];
    const text = winner === null ? `${reason} The duel is a draw.` : `${reason} ${room.seats[winner]?.name ?? room.board?.players[winner].name} wins!`;
    room.board?.log.push(text);
    this.systemLine(text);
  }

  private freeSeat(p: Seat) {
    const room = this.room!;
    room.seats[p] = null;
    room.rps = [null, null];
    room.rematch = [false, false];
    room.switchVotes[p] = false;
    if (room.stage !== "duel") this.resetToLobby();
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.att(ws);
      if (a.seat === p) { a.seat = null; ws.serializeAttachment(a); }
    }
  }

  private resetToLobby() {
    const room = this.room!;
    room.stage = "lobby";
    room.chooser = null;
    room.rps = [null, null];
    room.rpsLast = undefined;
    room.rematch = [false, false];
    room.board = null;
    room.winner = null;
    room.endReason = undefined;
  }

  private async closeRoom() {
    await this.env.DB.prepare("DELETE FROM rooms WHERE room_id = ?").bind(this.room!.roomId).run().catch((e) => console.error("rooms index", e));
    await this.ctx.storage.deleteAll();
    this.room = null;
  }

  // ---------- helpers ----------

  private seated(a: Attachment): Seat {
    if (a.seat === null) throw new RoomError("Spectators can't do that.");
    return a.seat;
  }

  private att(ws: WebSocket): Attachment {
    return (ws.deserializeAttachment() as Attachment | null) ?? { id: null, name: "Anonymous", seat: null };
  }

  private pushChat(line: ChatLine) {
    const chat = this.room!.chat;
    chat.push(line);
    if (chat.length > MAX_CHAT) chat.splice(0, chat.length - MAX_CHAT);
  }

  /** Room notice: stored in chat history and broadcast. */
  private systemLine(text: string) {
    const line: ChatLine = { from: "Room", text, at: Date.now(), system: true };
    this.pushChat(line);
    this.broadcast({ t: "chat", ...line });
  }

  private async save() {
    if (this.room) await this.ctx.storage.put("room", this.room);
  }

  private async scheduleAlarm(except?: WebSocket) {
    const room = this.room;
    if (!room) return;
    const times = room.seats.filter((s) => s && !s.connected && s.leftAt !== null).map((s) => s!.leftAt! + SEAT_GRACE_MS);
    if (this.live().filter((w) => w !== except).length === 0) times.push(Date.now() + (room.seats.some(Boolean) ? SEAT_GRACE_MS : 60_000));
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times) + 1000);
  }

  /** Sockets that pinged (or connected) recently. */
  private live(): WebSocket[] {
    const now = Date.now();
    return this.ctx.getWebSockets().filter((w) => {
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(w)?.getTime() ?? 0;
      return now - Math.max(pinged, this.att(w).since ?? 0) < STALE_MS;
    });
  }

  /** Close sockets whose client vanished without a close frame (e.g. aborted handshakes). */
  private async pruneStale() {
    const live = new Set(this.live());
    for (const ws of this.ctx.getWebSockets()) {
      if (live.has(ws)) continue;
      try { ws.close(4408, "timeout"); } catch { /* gone */ }
      await this.onLeave(ws);
    }
  }

  private spectatorCount(except?: WebSocket) {
    return this.live().filter((w) => w !== except && this.att(w).seat === null).length;
  }

  private roomInfo(except?: WebSocket): RoomInfo {
    const room = this.room!;
    const both = !!room.seats[0] && !!room.seats[1];
    return {
      roomId: room.roomId, name: room.name, mode: room.mode, host: room.host,
      players: room.seats.filter(Boolean).map((s) => s!.name),
      status: !both ? "waiting" : room.stage === "finished" ? "finished" : "dueling",
      created_at: room.created_at, spectators: this.spectatorCount(except),
    };
  }

  private session(viewer: Seat | null, except?: WebSocket): SessionInfo {
    const room = this.room!;
    const seats = room.seats.map((s) => s && {
      name: s.name, connected: s.connected, ready: !!s.deck,
      deck: s.deck ? { main: s.deck.main.length, extra: s.deck.extra.length, side: s.deck.side.length } : undefined,
    }) as SessionInfo["seats"];
    const showNotice = room.mode === "engine" && !engineAvailable();
    return {
      stage: room.stage, mode: room.mode, seats, spectators: this.spectatorCount(except),
      rps: {
        mine: viewer === null ? null : room.rps[viewer],
        opponentPicked: viewer === null ? false : room.rps[other(viewer)] !== null,
        last: room.rpsLast,
      },
      chooser: room.chooser, winner: room.winner, endReason: room.endReason, rematch: room.rematch,
      engineNotice: showNotice ? ENGINE_NOTICE : undefined,
      switchVotes: showNotice ? room.switchVotes : undefined,
    };
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket gone */ }
  }

  private broadcast(msg: ServerMsg, youOf?: (ws: WebSocket) => Seat | null) {
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, youOf && msg.t === "room" ? { ...msg, you: youOf(ws) } : msg);
    }
  }

  private broadcastSession(except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      this.send(ws, { t: "session", session: this.session(this.att(ws).seat, except) });
    }
  }

  /** Session + masked board to everyone. */
  private broadcastAll() {
    const room = this.room;
    if (!room) return;
    for (const ws of this.ctx.getWebSockets()) {
      const seat = this.att(ws).seat;
      this.send(ws, { t: "session", session: this.session(seat) });
      if (room.board) this.send(ws, { t: "state", state: maskBoard(room.board, seat) });
    }
  }

  private async updateIndex(except?: WebSocket) {
    const room = this.room;
    if (!room) return;
    const info = this.roomInfo(except);
    try {
      await this.env.DB.prepare(
        `INSERT INTO rooms (room_id, name, mode, host, players, status, spectators, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(room_id) DO UPDATE SET name = excluded.name, mode = excluded.mode, players = excluded.players,
           status = excluded.status, spectators = excluded.spectators, updated_at = excluded.updated_at`,
      ).bind(info.roomId, info.name, info.mode, info.host, JSON.stringify(info.players), info.status, info.spectators ?? 0, info.created_at, new Date().toISOString()).run();
    } catch (e) {
      console.error("rooms index update failed", e);
    }
  }
}

class RoomError extends Error {}
