import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env.ts";
import { dummyPasswordRecord, hashPassword, needsRehash, verifyPassword } from "../auth/crypto.ts";
import { sameOriginOk } from "../auth/csrf.ts";
import { clearAttempts, clientIp, LOGIN_IP_LIMIT, LOGIN_LIMIT, recordAttempt, REGISTER_LIMIT, underLimit } from "../auth/rateLimit.ts";
import { createSession, destroySession, loadSession } from "../auth/session.ts";

// PHASE 2 (accounts) owns this file.
// Contract the rest of the app relies on:
//   - authMiddleware sets c.var.user = { id, username } | null on every /api/* request
//     (the object also carries created_at)
//   - POST /api/auth/register {username, password} -> { user }   (sets session cookie)
//   - POST /api/auth/login    {username, password} -> { user }   (sets session cookie)
//   - POST /api/auth/logout                         -> { ok }
//   - GET  /api/auth/me                             -> { user | null }
//   - requireUser middleware for protected routes (401 when signed out)
// authMiddleware also rejects cross-origin state-changing /api requests (CSRF): any
// POST/PUT/PATCH/DELETE must carry an Origin header whose host matches the request's.

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (!sameOriginOk(c.req.raw)) return c.json({ error: "cross-origin request rejected" }, 403);
  c.set("user", await loadSession(c));
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) return c.json({ error: "sign in required" }, 401);
  await next();
});

export const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
export const PASSWORD_MIN = 8;
/** PBKDF2 cost grows with input length; cap it. */
export const PASSWORD_MAX = 256;

const GENERIC_LOGIN_ERROR = "Incorrect username or password.";
const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";

async function readCredentials(req: Request): Promise<{ username: string; password: string } | null> {
  const body = (await req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") return null;
  return { username: body.username.trim(), password: body.password };
}

export const auth = new Hono<AppEnv>();

auth.use("*", bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json({ error: "request too large" }, 413) }));

auth.get("/me", (c) => c.json({ user: c.var.user }));

auth.post("/register", async (c) => {
  const creds = await readCredentials(c.req.raw);
  if (!creds) return c.json({ error: "username and password are required" }, 400);
  const { username, password } = creds;
  if (!USERNAME_RE.test(username)) {
    return c.json({ error: "Username must be 3–20 characters: letters, numbers, _ or -." }, 400);
  }
  if (password.length < PASSWORD_MIN) return c.json({ error: `Password must be at least ${PASSWORD_MIN} characters.` }, 400);
  if (password.length > PASSWORD_MAX) return c.json({ error: `Password must be at most ${PASSWORD_MAX} characters.` }, 400);

  const db = c.env.DB;
  const regKey = `register:${clientIp(c)}`;
  if (!(await underLimit(db, [[regKey, REGISTER_LIMIT]]))) return c.json({ error: RATE_LIMITED }, 429);

  const existing = await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
  if (existing) return c.json({ error: "That username is taken." }, 409);

  const { hash, salt } = await hashPassword(password);
  const user = { id: crypto.randomUUID(), username, created_at: new Date().toISOString() };
  try {
    await db
      .prepare("INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, user.username, hash, salt, user.created_at)
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) return c.json({ error: "That username is taken." }, 409);
    throw e;
  }
  // count every successful registration against the per-IP limit
  await recordAttempt(db, [regKey]);
  await createSession(c, user.id);
  return c.json({ user });
});

auth.post("/login", async (c) => {
  const creds = await readCredentials(c.req.raw);
  if (!creds) return c.json({ error: "username and password are required" }, 400);
  const { username, password } = creds;
  if (password.length > PASSWORD_MAX || username.length > 64) return c.json({ error: GENERIC_LOGIN_ERROR }, 401);

  const db = c.env.DB;
  const ip = clientIp(c);
  const userKey = `login:${username.toLowerCase()}:${ip}`;
  const ipKey = `login-ip:${ip}`;
  if (!(await underLimit(db, [[userKey, LOGIN_LIMIT], [ipKey, LOGIN_IP_LIMIT]]))) {
    return c.json({ error: RATE_LIMITED }, 429);
  }

  const row = await db
    .prepare("SELECT id, username, password_hash, salt, created_at FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string; username: string; password_hash: string; salt: string; created_at: string }>();
  // Always run PBKDF2 so unknown usernames take as long as wrong passwords.
  const ok = await verifyPassword(password, row ? { hash: row.password_hash, salt: row.salt } : await dummyPasswordRecord());
  if (!row || !ok) {
    await recordAttempt(db, [userKey, ipKey]);
    return c.json({ error: GENERIC_LOGIN_ERROR }, 401);
  }

  await clearAttempts(db, userKey);
  if (needsRehash(row.password_hash)) {
    const { hash, salt } = await hashPassword(password);
    await db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").bind(hash, salt, row.id).run();
  }
  await createSession(c, row.id);
  return c.json({ user: { id: row.id, username: row.username, created_at: row.created_at } });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});
