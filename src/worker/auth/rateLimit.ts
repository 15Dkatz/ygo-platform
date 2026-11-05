import type { Context } from "hono";
import type { AppEnv } from "../env.ts";

// Fixed-window-ish limiter on top of D1: one row per failed attempt, counted over a window.
// Good enough for login brute-force protection; not meant for high-volume traffic.

export interface Limit {
  max: number;
  windowMs: number;
}

/** 10 failed logins per 15 minutes per username + IP. */
export const LOGIN_LIMIT: Limit = { max: 10, windowMs: 15 * 60 * 1000 };
/** Also cap failed logins per IP across all usernames (credential stuffing). */
export const LOGIN_IP_LIMIT: Limit = { max: 50, windowMs: 15 * 60 * 1000 };
/** 10 new accounts per hour per IP. */
export const REGISTER_LIMIT: Limit = { max: 10, windowMs: 60 * 60 * 1000 };

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") || "local";
}

/** True when `keys` are all under their limit. */
export async function underLimit(db: D1Database, checks: Array<[key: string, limit: Limit]>): Promise<boolean> {
  const now = Date.now();
  const results = await db.batch<{ n: number }>(
    checks.map(([key, limit]) =>
      db.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND attempted_at > ?").bind(key, now - limit.windowMs),
    ),
  );
  return results.every((r, i) => (r.results[0]?.n ?? 0) < checks[i][1].max);
}

export async function recordAttempt(db: D1Database, keys: string[]): Promise<void> {
  const now = Date.now();
  await db.batch([
    ...keys.map((key) => db.prepare("INSERT INTO auth_attempts (key, attempted_at) VALUES (?, ?)").bind(key, now)),
    // housekeeping: nothing we count is older than a day
    db.prepare("DELETE FROM auth_attempts WHERE attempted_at < ?").bind(now - 24 * 60 * 60 * 1000),
  ]);
}

export async function clearAttempts(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM auth_attempts WHERE key = ?").bind(key).run();
}
