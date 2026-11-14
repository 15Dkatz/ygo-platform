import { describe, expect, it } from "vitest";
import { cleanRarities, foilOf, foilParts, rarityLabel } from "./rarity.ts";

describe("card foils (lettering + picture)", () => {
  it("a combination that matches a named rarity is that rarity", () => {
    expect(foilOf("gold", "holo")).toBe("ultra");
    expect(foilOf("none", "none")).toBe("common");
    expect(foilOf("copper", "lattice")).toBe("custom:copper:lattice");
  });
  it("splits any value into its parts", () => {
    expect(foilParts("starlight")).toEqual({ lettering: "vivid", picture: "starlight" });
    expect(foilParts("custom:ruby:shimmer")).toEqual({ lettering: "ruby", picture: "shimmer" });
    expect(foilParts("custom:nope:holo")).toEqual({ lettering: "none", picture: "none" });
  });
  it("cleans what a client sends: keeps valid foils, drops commons and junk", () => {
    expect(cleanRarities({ 1: "ultra", 2: "custom:emerald:bubbles", 3: "common", 4: "custom:none:none", 5: "sparkly", x: "rare", 6: "custom:gold:holo" }))
      .toEqual({ 1: "ultra", 2: "custom:emerald:bubbles", 6: "ultra" });
  });
  it("names custom foils", () => expect(rarityLabel("custom:copper:lattice")).toBe("Copper lettering + Gold lattice"));
});
