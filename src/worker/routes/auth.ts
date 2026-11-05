import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env.ts";

// PHASE 2 (accounts) owns this file.
// Contract the rest of the app relies on:
//   - authMiddleware sets c.var.user = { id, username } | null on every /api/* request
//   - POST /api/auth/register {username, password} -> { user }   (sets session cookie)
//   - POST /api/auth/login    {username, password} -> { user }   (sets session cookie)
//   - POST /api/auth/logout                         -> { ok }
//   - GET  /api/auth/me                             -> { user | null }
//   - requireUser middleware for protected routes (401 when signed out)

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) return c.json({ error: "sign in required" }, 401);
  await next();
});

export const auth = new Hono<AppEnv>();

auth.get("/me", (c) => c.json({ user: c.var.user }));
