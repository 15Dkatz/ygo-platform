import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env.ts";
import { hashSessionToken, isWellFormedToken, newSessionToken } from "./crypto.ts";

export const SESSION_COOKIE = "ygo_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sliding renewal: extend the session (one D1 write) at most once a day. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  username: string;
  created_at: string;
}

/** Secure everywhere except plain-http localhost dev. */
function isSecure(c: Context<AppEnv>): boolean {
  const url = new URL(c.req.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  return !(url.protocol === "http:" && local);
}

function writeCookie(c: Context<AppEnv>, token: string, expiresAt: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
  });
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const { token, tokenHash } = await newSessionToken();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const previous = getCookie(c, SESSION_COOKIE);
  await c.env.DB.batch([
    // signing in again replaces whatever session this browser had
    ...(isWellFormedToken(previous)
      ? [c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashSessionToken(previous))]
      : []),
    // housekeeping: drop this user's expired sessions
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(userId, now),
    c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(
      tokenHash, userId, expiresAt, new Date(now).toISOString(),
    ),
  ]);
  writeCookie(c, token, expiresAt);
}

/** Resolve the cookie to a user, renewing the session when due. Clears invalid cookies. */
export async function loadSession(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token === undefined) return null;
  if (!isWellFormedToken(token)) {
    clearSessionCookie(c);
    return null;
  }
  const tokenHash = await hashSessionToken(token);
  const row = await c.env.DB.prepare(
    `SELECT s.expires_at, u.id, u.username, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
  ).bind(tokenHash).first<{ expires_at: number; id: string; username: string; created_at: string }>();
  const now = Date.now();
  if (!row || row.expires_at <= now) {
    if (row) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    clearSessionCookie(c);
    return null;
  }
  if (row.expires_at - now < SESSION_TTL_MS - RENEW_AFTER_MS) {
    const expiresAt = now + SESSION_TTL_MS;
    await c.env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(expiresAt, tokenHash).run();
    writeCookie(c, token, expiresAt);
  }
  return { id: row.id, username: row.username, created_at: row.created_at };
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (isWellFormedToken(token)) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashSessionToken(token)).run();
  }
  clearSessionCookie(c);
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isSecure(c), httpOnly: true, sameSite: "Lax" });
}
