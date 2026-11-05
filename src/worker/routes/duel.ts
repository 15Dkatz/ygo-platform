import { Hono } from "hono";
import type { AppEnv } from "../env.ts";

// PHASE 3 (manual duels) owns this file; PHASE 4 adds engine-mode options.
// Contract:
//   POST /api/rooms             { mode: DuelMode, name? } -> { roomId }   (requires sign-in)
//   GET  /api/rooms             -> { rooms: open rooms waiting for a player }
//   GET  /ws/room/:roomId       WebSocket upgrade, forwarded to the DuelRoom Durable Object

export const duel = new Hono<AppEnv>();
