import { describe, expect, it } from "vitest";
import { DEFAULT_SLEEVE, POPULAR_SLEEVES, SLEEVE_DESIGNS, cleanSleeve, sleeveLabel } from "./sleeves.ts";
import { STARTER_DECKS } from "./starterDecks.ts";

describe("sleeves", () => {
  it("keeps valid sleeves and falls back to the classic back", () => {
    expect(cleanSleeve("design:crimson")).toBe("design:crimson");
    expect(cleanSleeve("art:89631139")).toBe("art:89631139");
    for (const bad of [undefined, null, 5, "", "design:nope", "design:Crimson", "art:", "art:12", "art:12345678901", "art:1e9", "url:x", "design:crimson;x"]) expect(cleanSleeve(bad)).toBe(DEFAULT_SLEEVE);
  });
  it("labels", () => {
    expect(sleeveLabel("design:gold")).toBe("Gold filigree");
    expect(sleeveLabel("art:46986420")).toBe("Dark Magician art");
    expect(sleeveLabel("art:123456", () => "Some Card")).toBe("Some Card art");
  });
  it("has unique, valid designs and popular cards; starter decks have valid sleeves", () => {
    expect(new Set(SLEEVE_DESIGNS.map((d) => d.id)).size).toBe(SLEEVE_DESIGNS.length);
    expect(new Set(POPULAR_SLEEVES.map((d) => d.code)).size).toBe(POPULAR_SLEEVES.length);
    for (const d of SLEEVE_DESIGNS) expect(cleanSleeve(`design:${d.id}`)).toBe(`design:${d.id}`);
    for (const d of STARTER_DECKS) expect(cleanSleeve(d.sleeve)).toBe(d.sleeve);
  });
});

describe("background sleeves", () => {
  it("accepts scene sleeves and labels them", async () => {
    const { SCENE_SLEEVES } = await import("./sleeves.ts");
    expect(cleanSleeve("scene:22702055")).toBe("scene:22702055");
    expect(sleeveLabel("scene:22702055")).toBe("Umi (background)");
    expect(cleanSleeve("design:aurora")).toBe("design:aurora");
    expect(new Set(SCENE_SLEEVES.map((s) => s.code)).size).toBe(SCENE_SLEEVES.length);
  });
});
