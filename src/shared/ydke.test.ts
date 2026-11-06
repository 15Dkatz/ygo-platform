import { describe, expect, it } from "vitest";
import { parseYdke, toYdke } from "./ydke.ts";

describe("YDKe", () => {
  it("round-trips a deck", () => {
    const deck = { main: [89631139, 89631139, 46986414, 14558127], extra: [44508094], side: [] };
    expect(parseYdke(toYdke(deck))).toEqual(deck);
  });
  it("matches the reference encoding (little-endian uint32, base64)", () => {
    // 89631139 = 0x0557A9A3 -> bytes A3 A9 57 05 -> "o6lXBQ=="
    expect(toYdke({ main: [89631139], extra: [], side: [] })).toBe("ydke://o6lXBQ==!!!");
    expect(parseYdke("ydke://o6lXBQ==!!!")).toEqual({ main: [89631139], extra: [], side: [] });
  });
  it("handles large passcodes (> 2^31)", () => {
    const deck = { main: [3_000_000_000], extra: [], side: [] };
    expect(parseYdke(toYdke(deck)).main[0]).toBe(3_000_000_000);
  });
  it("rejects non-YDKe text with a readable error", () => {
    expect(() => parseYdke("#main\n123")).toThrow(/ydke:\/\//);
    expect(() => parseYdke("ydke://abc")).toThrow(/not a YDKe deck/);
    expect(() => parseYdke("ydke://AAA!!!")).toThrow(/not a YDKe deck/);
  });
});
