import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import type { RoomInfo } from "../../shared/duel.ts";
import type { DuelMode } from "../../shared/types.ts";
import { authMiddleware } from "./auth.ts";
import { REQUIRE_ACCOUNT, cleanName, getIdentity, setGuestName, withIdentity } from "../duel/identity.ts";
import type { DuelRoom } from "../duel/DuelRoom.ts";

// PHASE 3 (manual duels) owns this file; PHASE 4 adds engine-mode options.
// Contract:
//   GET  /api/duel/me           -> { identity: {id,name,guest} | null, requireAccount }
//   POST /api/duel/guest        { name } -> { identity }   (sets the ygo_guest cookie; 403 when accounts are required)
//   POST /api/rooms             { mode: DuelMode, name? } -> { roomId }   (needs an identity: account or guest)
//   GET  /api/rooms             -> { rooms: RoomInfo[] }  open + in-progress rooms, newest first
//   GET  /ws/room/:roomId       WebSocket upgrade, forwarded to the DuelRoom Durable Object

export const duel = new Hono<AppEnv>();

const ROOM_ID = /^[a-z0-9]{10}$/;
const MODES: DuelMode[] = ["manual", "engine"];

function newRoomId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return [...b].map((x) => alphabet[x % alphabet.length]).join("");
}

const roomStub = (env: AppEnv["Bindings"], roomId: string) => {
  const ns = env.DUEL_ROOM as unknown as DurableObjectNamespace<DuelRoom>;
  return ns.get(ns.idFromName(roomId));
};

duel.get("/api/duel/me", (c) => c.json({ identity: getIdentity(c), requireAccount: REQUIRE_ACCOUNT }));

duel.post("/api/duel/guest", async (c) => {
  if (REQUIRE_ACCOUNT) return c.json({ error: "sign in to duel" }, 403);
  if (c.var.user) return c.json({ identity: getIdentity(c) });
  const body = await c.req.json<{ name?: unknown }>().catch(() => ({ name: undefined }));
  const name = cleanName(body.name);
  if (!name) return c.json({ error: "Pick a display name (1–24 characters)." }, 400);
  return c.json({ identity: setGuestName(c, name) });
});

duel.post("/api/rooms", async (c) => {
  const ident = getIdentity(c);
  if (!ident) return c.json({ error: REQUIRE_ACCOUNT ? "sign in required" : "Pick a display name first." }, 401);
  const body = await c.req.json<{ mode?: unknown; name?: unknown }>().catch(() => ({}) as { mode?: unknown; name?: unknown });
  const mode = (MODES as unknown[]).includes(body.mode) ? (body.mode as DuelMode) : "manual";
  const name = (typeof body.name === "string" ? body.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40) : "") || `${ident.name}'s room`;
  const roomId = newRoomId();
  await roomStub(c.env, roomId).init({ roomId, name, mode, host: ident.name });
  return c.json({ roomId }, 201);
});

duel.get("/api/rooms", async (c) => {
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const r = await c.env.DB.prepare(
    `SELECT room_id, name, mode, host, players, status, spectators, created_at FROM rooms
     WHERE status IN ('waiting', 'dueling') AND updated_at > ? ORDER BY created_at DESC LIMIT 100`,
  ).bind(since).all<{ room_id: string; name: string; mode: DuelMode; host: string; players: string; status: RoomInfo["status"]; spectators: number; created_at: string }>();
  const rooms: RoomInfo[] = r.results.map((row) => ({
    roomId: row.room_id, name: row.name, mode: row.mode, host: row.host,
    players: JSON.parse(row.players || "[]"), status: row.status, created_at: row.created_at, spectators: row.spectators,
  }));
  c.header("Cache-Control", "no-store");
  return c.json({ rooms });
});

// /ws/* is outside /api/*, so run the auth middleware here to get c.var.user. With phase 2 merged,
// authMiddleware resolves the ygo_session cookie via loadSession(c) (its CSRF check only applies to
// POST/PUT/PATCH/DELETE, so the GET upgrade passes). getIdentity() then prefers the account over the guest cookie.
duel.use("/ws/*", authMiddleware);

duel.get("/ws/room/:roomId", async (c) => {
  const roomId = c.req.param("roomId");
  if (!ROOM_ID.test(roomId)) return c.json({ error: "room not found" }, 404);
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "expected a websocket upgrade" }, 426);
  // Cross-site WebSocket hijacking guard: browsers always send Origin on websocket handshakes.
  const origin = c.req.header("Origin");
  if (!origin || new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: "cross-origin websocket rejected" }, 403);
  return roomStub(c.env, roomId).fetch(withIdentity(c.req.raw, getIdentity(c)));
});
