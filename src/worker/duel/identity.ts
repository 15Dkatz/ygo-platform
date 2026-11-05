// Who is talking to the duel rooms. Signed-in users (phase 2, c.var.user) win; otherwise a
// guest identity kept in the `ygo_guest` cookie (random id + display name picked in the lobby).
// To require accounts for dueling, set REQUIRE_ACCOUNT = true: guests then get null everywhere.

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env.ts";

export const REQUIRE_ACCOUNT = true;
export const GUEST_COOKIE = "ygo_guest";

export interface Identity {
  id: string;        // "u:<user id>" or "g:<random>"
  name: string;
  guest: boolean;
}

/** Trim and validate a display name: 1–24 printable characters. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
  return name.length ? name : null;
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

function readGuest(c: Context<AppEnv>): Identity | null {
  const raw = getCookie(c, GUEST_COOKIE);
  if (!raw) return null;
  try {
    const v = JSON.parse(unb64url(raw)) as { id?: unknown; name?: unknown };
    const name = cleanName(v.name);
    if (typeof v.id !== "string" || !/^g:[A-Za-z0-9_-]{8,40}$/.test(v.id) || !name) return null;
    return { id: v.id, name, guest: true };
  } catch {
    return null;
  }
}

export function getIdentity(c: Context<AppEnv>): Identity | null {
  const user = c.var.user;
  if (user) return { id: `u:${user.id}`, name: user.username, guest: false };
  if (REQUIRE_ACCOUNT) return null;
  return readGuest(c);
}

/** Create (or rename) the guest identity and store it in the cookie. */
export function setGuestName(c: Context<AppEnv>, name: string): Identity {
  const existing = readGuest(c);
  const id = existing?.id ?? `g:${crypto.randomUUID().replace(/-/g, "")}`;
  const ident: Identity = { id, name, guest: true };
  setCookie(c, GUEST_COOKIE, b64url(JSON.stringify({ id, name })), {
    path: "/", httpOnly: true, sameSite: "Lax", secure: new URL(c.req.url).protocol === "https:", maxAge: 60 * 60 * 24 * 365,
  });
  return ident;
}

// The Worker passes the identity to the Durable Object in these headers (the DO is only reachable through the Worker).
const H_ID = "x-duel-identity-id";
const H_NAME = "x-duel-identity-name";

export function withIdentity(req: Request, ident: Identity | null): Request {
  const headers = new Headers(req.headers);
  headers.delete(H_ID);
  headers.delete(H_NAME);
  if (ident) {
    headers.set(H_ID, ident.id);
    headers.set(H_NAME, encodeURIComponent(ident.name));
  }
  return new Request(req, { headers });
}

export function identityFromHeaders(req: Request): Identity | null {
  const id = req.headers.get(H_ID);
  const name = req.headers.get(H_NAME);
  if (!id || !name) return null;
  return { id, name: decodeURIComponent(name), guest: id.startsWith("g:") };
}
