// Integration check for the phase 2 API (accounts, sessions, decks, tags, CSRF, rate limit).
//
//   npx vite --port 5175                      # in another terminal (local D1, migrations applied)
//   node scripts/auth-integration.mjs         # BASE=http://localhost:5175 by default
//
// It creates throwaway users named it_<random> with random passwords, and uses
// the dev server's Local Explorer API to reset rate-limit rows and to age sessions, so run it
// against the local dev server only.

import { randomBytes, randomUUID } from "node:crypto";

const BASE = process.env.BASE || "http://localhost:5175";
const ORIGIN = new URL(BASE).origin;
let failures = 0;
let passes = 0;

function check(cond, label, extra) {
  if (cond) {
    passes++;
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}

/** Run SQL on the dev server's local D1 through the Cloudflare Vite plugin's Local Explorer API
 *  (running `wrangler d1 execute --local` next to a live dev server can corrupt/crash on Windows). */
let dbId = null;
async function sql(command) {
  const explorer = `${BASE}/cdn-cgi/local/explorer/api/d1/database`;
  dbId ??= (await (await fetch(explorer)).json()).result.find((d) => d.name === "DB").uuid;
  const res = await fetch(`${explorer}/${dbId}/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: command }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`SQL failed: ${JSON.stringify(data.errors)}`);
  const { columns, rows } = data.result[0].results;
  return rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

class Client {
  cookie = null;
  async req(method, path, body, { origin = ORIGIN, headers = {} } = {}) {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    if (this.cookie) h.Cookie = `ygo_session=${this.cookie}`;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    // like a browser: the last ygo_session Set-Cookie wins (a stale cookie may be cleared before a new one is set)
    const setCookie = res.headers.getSetCookie().filter((c) => c.startsWith("ygo_session=")).pop();
    if (setCookie) {
      const value = setCookie.split(";")[0].slice("ygo_session=".length);
      this.cookie = value && !/max-age=0/i.test(setCookie) ? value : null;
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data, setCookie };
  }
}

const rand = () => randomBytes(4).toString("hex");
const password = () => randomBytes(12).toString("base64url");
const cardIds = (n) => Array.from({ length: n }, () => 10_000_000 + Math.floor(Math.random() * 89_999_999));
const sampleDeck = (i) => ({
  id: randomUUID(),
  name: `Sample deck ${String(i + 1).padStart(3, "0")}`,
  main: cardIds(40 + (i % 21)),
  extra: cardIds(15),
  side: cardIds(15),
  file_modified: "2024-05-01",
  file_created: "2023-01-15",
  created_at: "2024-05-01T10:00:00.000Z",
  updated_at: "2024-05-02T10:00:00.000Z",
});

console.log(`Phase 2 integration check against ${BASE}`);
await sql("DELETE FROM auth_attempts");

// ---------------------------------------------------------------- accounts
console.log("\nregister / me");
const a = new Client();
const aName = `it_${rand()}`;
const aPass = password();
let r = await a.req("POST", "/api/auth/register", { username: aName, password: aPass });
check(r.status === 200 && r.data?.user?.username === aName, "register returns the user", r);
check(!!a.cookie, "register sets ygo_session cookie");
check(/HttpOnly/i.test(r.setCookie) && /SameSite=Lax/i.test(r.setCookie) && /Path=\//.test(r.setCookie), "cookie is HttpOnly, SameSite=Lax, Path=/", r.setCookie);
check(!/Secure/i.test(r.setCookie), "cookie is not Secure on http://localhost", r.setCookie);
check(/Max-Age=259(1|2)\d{3}/.test(r.setCookie), "cookie lasts 30 days", r.setCookie);
const stored = await sql(`SELECT s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = '${aName}'`);
check(stored.length === 1 && stored[0].token_hash !== a.cookie && /^[0-9a-f]{64}$/.test(stored[0].token_hash), "only a SHA-256 of the token is stored");
const userRow = (await sql(`SELECT password_hash, salt FROM users WHERE username = '${aName}'`))[0];
check(userRow.password_hash.startsWith("pbkdf2-sha256$100000$") && !userRow.password_hash.includes(aPass), "password stored as PBKDF2 (100k) hash");

r = await a.req("GET", "/api/auth/me");
check(r.status === 200 && r.data?.user?.username === aName, "me returns the signed-in user", r);
r = await new Client().req("GET", "/api/auth/me");
check(r.status === 200 && r.data?.user === null, "me returns null when signed out", r);

r = await new Client().req("POST", "/api/auth/register", { username: aName.toUpperCase(), password: password() });
check(r.status === 409, "username is unique ignoring case", r);
r = await new Client().req("POST", "/api/auth/register", { username: "ab", password: password() });
check(r.status === 400, "rejects too-short username", r);
r = await new Client().req("POST", "/api/auth/register", { username: "bad name!", password: password() });
check(r.status === 400, "rejects invalid username characters", r);
r = await new Client().req("POST", "/api/auth/register", { username: `it_${rand()}`, password: "short" });
check(r.status === 400, "rejects password under 8 characters", r);

// ---------------------------------------------------------------- logout / login
console.log("\nlogout / login");
const oldCookie = a.cookie;
r = await a.req("POST", "/api/auth/logout");
check(r.status === 200 && r.data?.ok === true && a.cookie === null, "logout clears the cookie", r);
const replay = new Client();
replay.cookie = oldCookie;
r = await replay.req("GET", "/api/auth/me");
check(r.data?.user === null, "old session token no longer works after logout", r);

r = await a.req("POST", "/api/auth/login", { username: aName, password: "wrong-password-1" });
const wrongMsg = r.data?.error;
check(r.status === 401, "wrong password -> 401", r);
r = await a.req("POST", "/api/auth/login", { username: `nobody_${rand()}`, password: "wrong-password-1" });
check(r.status === 401 && r.data?.error === wrongMsg, "unknown username gives the identical error", r);
r = await a.req("POST", "/api/auth/login", { username: aName.toUpperCase(), password: aPass });
check(r.status === 200 && r.data?.user?.username === aName && !!a.cookie, "login (case-insensitive username) works", r);

// ---------------------------------------------------------------- sessions
console.log("\nsession expiry / sliding renewal");
await sql(`UPDATE sessions SET expires_at = ${Date.now() + 2 * 86400_000} WHERE user_id = (SELECT id FROM users WHERE username = '${aName}')`);
r = await a.req("GET", "/api/auth/me");
check(r.data?.user?.username === aName && /Max-Age=259(1|2)\d{3}/.test(r.setCookie ?? ""), "session close to expiry is renewed to 30 days", r.setCookie);
const renewed = (await sql(`SELECT expires_at FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = '${aName}')`))[0];
check(renewed.expires_at > Date.now() + 29 * 86400_000, "renewal is stored in D1");
r = await a.req("GET", "/api/auth/me");
check(r.setCookie === undefined, "fresh session is not rewritten on every request");
const b = new Client();
await b.req("POST", "/api/auth/login", { username: aName, password: aPass });
await sql(`UPDATE sessions SET expires_at = ${Date.now() - 1000} WHERE user_id = (SELECT id FROM users WHERE username = '${aName}')`);
r = await b.req("GET", "/api/auth/me");
check(r.data?.user === null, "expired session is rejected", r);
await a.req("POST", "/api/auth/login", { username: aName, password: aPass });

// ---------------------------------------------------------------- rate limit
console.log("\nrate limit");
const rl = new Client();
const rlName = `it_${rand()}`;
const rlPass = password();
await rl.req("POST", "/api/auth/register", { username: rlName, password: rlPass });
await rl.req("POST", "/api/auth/logout");
let statuses = [];
for (let i = 0; i < 10; i++) statuses.push((await rl.req("POST", "/api/auth/login", { username: rlName, password: `nope-${i}-xxxx` })).status);
check(statuses.every((s) => s === 401), "first 10 wrong passwords -> 401", statuses);
r = await rl.req("POST", "/api/auth/login", { username: rlName, password: rlPass });
check(r.status === 429, "11th attempt is rate limited even with the right password", r);
r = await rl.req("POST", "/api/auth/login", { username: aName, password: aPass });
check(r.status === 200, "other usernames from the same IP are unaffected", r);
await sql("DELETE FROM auth_attempts");

// ---------------------------------------------------------------- CSRF
console.log("\nCSRF");
r = await a.req("PUT", "/api/decks/csrf-test", { name: "x" }, { origin: "https://evil.example" });
check(r.status === 403, "cross-origin PUT rejected", r);
r = await a.req("POST", "/api/auth/logout", undefined, { origin: null });
check(r.status === 403, "POST without Origin rejected", r);
r = await a.req("POST", "/api/auth/login", { username: aName, password: aPass }, { origin: "http://localhost:9999" });
check(r.status === 403, "different port counts as cross-origin", r);
r = await a.req("GET", "/api/auth/me", undefined, { origin: "https://evil.example" });
check(r.status === 200 && r.data?.user?.username === aName, "GET is allowed from anywhere and session survived", r);

// ---------------------------------------------------------------- decks
console.log("\ndecks CRUD");
r = await new Client().req("GET", "/api/decks");
check(r.status === 401, "GET /api/decks signed out -> 401", r);
r = await a.req("GET", "/api/decks");
check(r.status === 200 && Array.isArray(r.data?.decks) && r.data.decks.length === 0, "new user has no decks", r);
const d1 = sampleDeck(0);
r = await a.req("PUT", `/api/decks/${d1.id}`, d1);
check(r.status === 200 && r.data?.deck?.id === d1.id && r.data.deck.main.length === d1.main.length, "PUT creates a deck", r);
check(r.data?.deck?.created_at === d1.created_at && r.data.deck.updated_at !== d1.updated_at, "PUT keeps created_at, sets updated_at", r.data?.deck);
r = await a.req("PUT", `/api/decks/${d1.id}`, { ...d1, name: "Renamed", main: [1, 2, 3], created_at: "2030-01-01T00:00:00.000Z" });
check(r.status === 200 && r.data.deck.name === "Renamed" && r.data.deck.main.join() === "1,2,3", "PUT replaces a deck", r);
check(r.data?.deck?.created_at === d1.created_at, "replacing never changes created_at", r.data?.deck);
r = await a.req("GET", `/api/decks/${d1.id}`);
check(r.status === 200 && r.data?.deck?.name === "Renamed", "GET /:id returns it", r);
r = await a.req("PUT", `/api/decks/${randomUUID()}`, { ...sampleDeck(1), id: undefined, main: cardIds(101) });
check(r.status === 400, "rejects > 100 cards in a section", r);
r = await a.req("PUT", `/api/decks/${randomUUID()}`, { name: "x", main: [1.5] });
check(r.status === 400, "rejects non-integer ids", r);
r = await a.req("PUT", `/api/decks/${randomUUID()}`, { name: "x", main: ["123"] });
check(r.status === 400, "rejects string ids", r);
r = await a.req("PUT", `/api/decks/${randomUUID()}`, { name: "x".repeat(101) });
check(r.status === 400, "rejects deck name > 100 chars", r);
r = await a.req("PUT", `/api/decks/${randomUUID()}`, { name: "   " });
check(r.status === 400, "rejects empty deck name", r);
r = await a.req("PUT", `/api/decks/${randomUUID()}`, { id: "other", name: "x" });
check(r.status === 400, "rejects body id != URL id", r);
r = await a.req("PUT", `/api/decks/${randomUUID()}`, { name: "x", file_modified: "yesterday" });
check(r.status === 400, "rejects malformed file dates", r);

// another user can't see or touch it
const c = new Client();
await c.req("POST", "/api/auth/register", { username: `it_${rand()}`, password: password() });
r = await c.req("GET", "/api/decks");
check(r.data?.decks?.length === 0, "other user sees none of these decks", r);
r = await c.req("GET", `/api/decks/${d1.id}`);
check(r.status === 404, "other user gets 404 for the deck", r);
await c.req("DELETE", `/api/decks/${d1.id}`);
r = await c.req("PUT", `/api/decks/${d1.id}`, { ...d1, name: "Hijack" });
check(r.status === 200, "same deck id in another account is a separate deck", r);
r = await a.req("GET", `/api/decks/${d1.id}`);
check(r.data?.deck?.name === "Renamed", "other user's DELETE/PUT did not affect the owner's deck", r);

r = await a.req("DELETE", `/api/decks/${d1.id}`);
check(r.status === 200 && r.data?.ok, "DELETE removes the deck", r);
r = await a.req("GET", `/api/decks/${d1.id}`);
check(r.status === 404, "deleted deck is gone", r);

// ---------------------------------------------------------------- bulk
console.log("\nbulk import");
const many = Array.from({ length: 212 }, (_, i) => sampleDeck(i));
let t0 = Date.now();
r = await a.req("POST", "/api/decks/bulk", { decks: many });
check(r.status === 200 && r.data?.count === 212, `bulk import of 212 decks in one request (${Date.now() - t0} ms)`, r);
t0 = Date.now();
r = await a.req("GET", "/api/decks");
check(r.data?.decks?.length === 212, `list returns 212 decks (${Date.now() - t0} ms)`, r.data?.decks?.length);
const got = r.data.decks.find((d) => d.id === many[7].id);
check(
  got && got.main.join() === many[7].main.join() && got.side.join() === many[7].side.join() && got.file_created === "2023-01-15" && got.created_at === many[7].created_at,
  "bulk keeps card order, file dates and timestamps",
  got,
);
r = await a.req("POST", "/api/decks/bulk", { decks: many.slice(0, 5).map((d) => ({ ...d, name: d.name + " v2" })) });
check(r.status === 200 && r.data?.count === 5, "re-import upserts instead of duplicating", r);
r = await a.req("GET", "/api/decks");
check(r.data?.decks?.length === 212 && r.data.decks.some((d) => d.name.endsWith(" v2")), "still 212 decks after re-import");
r = await a.req("POST", "/api/decks/bulk", { decks: [sampleDeck(1), { ...sampleDeck(2), main: [-1] }] });
check(r.status === 400 && /deck 2/.test(r.data?.error), "one bad deck fails the whole batch with its index", r);
r = await a.req("GET", "/api/decks");
check(r.data?.decks?.length === 212, "nothing from the failed batch was saved");
r = await a.req("POST", "/api/decks/bulk", { decks: Array.from({ length: 501 }, (_, i) => ({ id: `x${i}`, name: "x" })) });
check(r.status === 413, "more than 500 decks per request -> 413", r.status);

console.log("\ndeck quota");
const q = new Client();
await q.req("POST", "/api/auth/register", { username: `it_${rand()}`, password: password() });
statuses = [];
for (let k = 0; k < 4; k++) {
  const batch = Array.from({ length: 500 }, (_, i) => ({ id: `q${k * 500 + i}`, name: `Quota ${k * 500 + i}`, main: [1, 2, 3] }));
  statuses.push((await q.req("POST", "/api/decks/bulk", { decks: batch })).status);
}
check(statuses.every((s) => s === 200), "2000 decks fit (4 requests of 500)", statuses);
r = await q.req("PUT", "/api/decks/one-too-many", { name: "2001st" });
check(r.status === 413, "2001st deck is refused", r);
r = await q.req("PUT", "/api/decks/q5", { name: "Replacing an existing deck still works" });
check(r.status === 200, "replacing an existing deck at the limit is fine", r);

// ---------------------------------------------------------------- tags
console.log("\ntags");
r = await a.req("GET", "/api/decks/tags");
check(r.status === 200 && JSON.stringify(r.data?.tags) === "{}", "no tags initially", r);
const tags = { "ash blossom & joyous spring": ["handtrap", "tier:S"], "Pot of Prosperity": ["draw"] };
r = await a.req("PUT", "/api/decks/tags", { tags });
check(r.status === 200 && r.data?.ok, "PUT tags", r);
r = await a.req("GET", "/api/decks/tags");
check(
  JSON.stringify(r.data?.tags) === JSON.stringify({ "ash blossom & joyous spring": ["handtrap", "tier:S"], "pot of prosperity": ["draw"] }),
  "GET tags round-trips (names lower-cased, order kept)",
  r.data,
);
const bigTags = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`card ${i}`, ["a", "b", "c"]]));
r = await a.req("PUT", "/api/decks/tags", { tags: bigTags });
r = await a.req("GET", "/api/decks/tags");
check(Object.keys(r.data?.tags ?? {}).length === 400, "PUT replaces all tags (1200 rows, chunked)", Object.keys(r.data?.tags ?? {}).length);
r = await a.req("PUT", "/api/decks/tags", { tags: { x: "not-an-array" } });
check(r.status === 400, "rejects malformed tags", r);
r = await c.req("GET", "/api/decks/tags");
check(JSON.stringify(r.data?.tags) === "{}", "tags are per user", r);

// ---------------------------------------------------------------- done
await a.req("POST", "/api/auth/logout");
r = await a.req("GET", "/api/decks");
check(r.status === 401, "decks need sign-in again after logout", r);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
