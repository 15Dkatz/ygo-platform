// Password hashing and session tokens, WebCrypto only (works in Workers and Node >= 20).

/** Cloudflare Workers reject PBKDF2 with more than 100,000 iterations
 *  ("iteration counts above 100000 are not supported"), so this is the maximum.
 *  The count is stored inside each hash, so it can be raised later and old hashes
 *  still verify (and get rehashed on next login, see `needsRehash`). */
export const PBKDF2_ITERATIONS = 100_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;
const SCHEME = "pbkdf2-sha256";

export const SESSION_TOKEN_BYTES = 32;

const enc = new TextEncoder();

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Constant-time comparison (length is not secret: both sides are fixed-size hashes). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

export interface PasswordRecord {
  /** "pbkdf2-sha256$<iterations>$<base64 hash>" */
  hash: string;
  /** base64 */
  salt: string;
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<PasswordRecord> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2(password, salt, iterations);
  return { hash: `${SCHEME}$${iterations}$${toBase64(hash)}`, salt: toBase64(salt) };
}

function parseHash(stored: string): { iterations: number; hash: Uint8Array } | null {
  const [scheme, iter, b64] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== SCHEME || !Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000 || !b64) return null;
  try {
    return { iterations, hash: fromBase64(b64) };
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  const parsed = parseHash(record.hash);
  if (!parsed) return false;
  const actual = await pbkdf2(password, fromBase64(record.salt), parsed.iterations);
  return timingSafeEqual(actual, parsed.hash);
}

/** True when a stored hash uses fewer iterations than the current setting. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  return !parsed || parsed.iterations < PBKDF2_ITERATIONS;
}

/** A dummy record used to spend the same time on unknown usernames as on real ones. */
let dummy: Promise<PasswordRecord> | null = null;
export function dummyPasswordRecord(): Promise<PasswordRecord> {
  return (dummy ??= hashPassword(toBase64(randomBytes(16))));
}

/** New session token (sent to the browser) and its SHA-256 (stored in D1). */
export async function newSessionToken(): Promise<{ token: string; tokenHash: string }> {
  const token = toBase64Url(randomBytes(SESSION_TOKEN_BYTES));
  return { token, tokenHash: await hashSessionToken(token) };
}

export async function hashSessionToken(token: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(token))));
}

/** Cheap shape check before touching the database (43 base64url chars for 32 bytes). */
export function isWellFormedToken(token: string | undefined): token is string {
  return !!token && /^[A-Za-z0-9_-]{43}$/.test(token);
}
