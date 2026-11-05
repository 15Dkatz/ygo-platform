import { Hono } from "hono";
import type { AppEnv } from "../env.ts";

// PHASE 2 (accounts) owns this file: per-user deck + custom-tag storage in D1.
// Contract (all require sign-in, bodies use the shared `Deck` type):
//   GET    /api/decks            -> { decks: Deck[] }
//   PUT    /api/decks/:id        Deck -> { deck }        (create or replace)
//   POST   /api/decks/bulk       { decks: Deck[] } -> { count }   (folder import)
//   DELETE /api/decks/:id        -> { ok }
//   GET    /api/decks/tags       -> { tags: CustomTags }
//   PUT    /api/decks/tags       { tags: CustomTags } -> { ok }

export const decks = new Hono<AppEnv>();
