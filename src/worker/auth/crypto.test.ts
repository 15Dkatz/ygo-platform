import { describe, expect, it } from "vitest";
import {
  PBKDF2_ITERATIONS,
  fromBase64,
  hashPassword,
  hashSessionToken,
  isWellFormedToken,
  needsRehash,
  newSessionToken,
  timingSafeEqual,
  verifyPassword,
} from "./crypto.ts";
import { sameOriginOk } from "./csrf.ts";

describe("password hashing", () => {
  it("uses the Workers maximum of 100,000 PBKDF2 iterations and stores the count", async () => {
    expect(PBKDF2_ITERATIONS).toBe(100_000);
    const rec = await hashPassword("correct horse battery");
    const [scheme, iter, hash] = rec.hash.split("$");
    expect(scheme).toBe("pbkdf2-sha256");
    expect(Number(iter)).toBe(100_000);
    expect(fromBase64(hash)).toHaveLength(32);
    expect(fromBase64(rec.salt)).toHaveLength(16);
  });

  it("verifies the right password and rejects wrong ones", async () => {
    const rec = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", rec)).toBe(true);
    expect(await verifyPassword("correct horse batterY", rec)).toBe(false);
    expect(await verifyPassword("", rec)).toBe(false);
  });

  it("salts every hash differently", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPassword("same password", { hash: a.hash, salt: b.salt })).toBe(false);
  });

  it("verifies hashes made with an older iteration count and flags them for rehash", async () => {
    const old = await hashPassword("legacy password", 1000);
    expect(old.hash.startsWith("pbkdf2-sha256$1000$")).toBe(true);
    expect(await verifyPassword("legacy password", old)).toBe(true);
    expect(needsRehash(old.hash)).toBe(true);
    expect(needsRehash((await hashPassword("x".repeat(8))).hash)).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    const rec = await hashPassword("whatever123");
    expect(await verifyPassword("whatever123", { hash: "md5$1$abc", salt: rec.salt })).toBe(false);
    expect(await verifyPassword("whatever123", { hash: "pbkdf2-sha256$abc$xyz", salt: rec.salt })).toBe(false);
    expect(needsRehash("garbage")).toBe(true);
  });

  it("normalises unicode so the same visible password verifies", async () => {
    const rec = await hashPassword("café-password");
    expect(await verifyPassword("café-password", rec)).toBe(true);
  });
});

describe("timingSafeEqual", () => {
  it("compares byte arrays", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("session tokens", () => {
  it("are 32 random bytes, base64url encoded, and only their SHA-256 is kept", async () => {
    const { token, tokenHash } = await newSessionToken();
    expect(isWellFormedToken(token)).toBe(true);
    expect(token).toHaveLength(43);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(await hashSessionToken(token)).toBe(tokenHash);
  });

  it("are unique", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 200; i++) tokens.add((await newSessionToken()).token);
    expect(tokens.size).toBe(200);
  });

  it("rejects malformed cookie values before any lookup", () => {
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken("a".repeat(42))).toBe(false);
    expect(isWellFormedToken("a".repeat(42) + "=")).toBe(false);
    expect(isWellFormedToken("' OR 1=1 --" + "a".repeat(32))).toBe(false);
  });
});

describe("CSRF origin check", () => {
  const req = (method: string, origin?: string) =>
    new Request("https://duel.example.com/api/decks/x", { method, headers: origin ? { Origin: origin } : {} });

  it("allows safe methods without Origin", () => {
    expect(sameOriginOk(req("GET"))).toBe(true);
    expect(sameOriginOk(req("HEAD"))).toBe(true);
  });
  it("allows same-origin writes", () => {
    expect(sameOriginOk(req("PUT", "https://duel.example.com"))).toBe(true);
  });
  it("rejects cross-origin, null and missing Origin on writes", () => {
    expect(sameOriginOk(req("POST", "https://evil.example.com"))).toBe(false);
    expect(sameOriginOk(req("POST", "https://duel.example.com.evil.com"))).toBe(false);
    expect(sameOriginOk(req("DELETE", "null"))).toBe(false);
    expect(sameOriginOk(req("POST"))).toBe(false);
  });
});
