import { describe, expect, it } from "vitest";
import { hintText } from "./strings.ts";
import { ARTWORK_OFFSET, EngineData, clearEngineCaches, type EngineCardRow } from "./data.ts";

describe("engine hint text", () => {
  const names = (c: number) => (c === 197042 ? "Exosister Returnia" : null);
  it("maps known hint ids (EDOPro's own wording)", () => {
    expect(hintText(569, () => "", names)).toBe("Select the zone to place this card");
    expect(hintText(1, () => "", names)).toBe("Normal Summon");
    expect(hintText(1213, () => "", names)).toBe("Yes");
  });
  it("fills the placeholders of system strings", () => expect(hintText(95, () => "", names)).toBe("Use the effect of this card?"));
  it("shows a card's name when the hint is a card code", () => expect(hintText(197042, () => "", names)).toBe("Exosister Returnia"));
  it("shows nothing for hint 0 or an unknown card code", () => {
    expect(hintText(0, () => "", names)).toBe("");
    expect(hintText(662857, () => "", names)).toBe("");
  });
  it("shows a card's name for passcodes above 1 << 20", () => expect(hintText(44095762, (d) => `str ${d}`, (c) => (c === 44095762 ? "Mirror Force" : null))).toBe("Mirror Force"));
  it("resolves card strings (code << 20 | index)", () => expect(hintText((5 << 20) | 1, (d) => `str ${d}`)).toBe(`str ${(5 << 20) | 1}`));
});

describe("alternate artworks", () => {
  it("play as their original card (alias within the artwork offset)", async () => {
    clearEngineCaches();
    const row = (id: number, alias: number): EngineCardRow =>
      ({ id, alias, setcodes: [], type: 0x21, level: 4, attribute: 0, race: 0, atk: 0, def: 0, lscale: 0, rscale: 0, link_marker: 0, ot: 0, name: `c${id}`, strings: [], has_script: id === alias || alias === 0 } as unknown as EngineCardRow);
    const rows = new Map([[5043010, row(5043010, 0)], [5043012, row(5043012, 5043010)], [900, row(900, 100)]]);
    const data = new EngineData({ cards: async (ids) => new Map(ids.flatMap((i) => (rows.has(i) ? [[i, rows.get(i)!]] : []))), scripts: async () => new Map() });
    await data.ensureCards([5043010, 5043012, 900]);
    expect(data.canonical(5043012)).toBe(5043010);
    expect(data.canonical(5043010)).toBe(5043010);
    expect(Math.abs(900 - 100)).toBeGreaterThanOrEqual(ARTWORK_OFFSET);
    expect(data.canonical(900)).toBe(900); // a far alias is a different card (e.g. a rule-named card), not an artwork
    clearEngineCaches();
  });
});
