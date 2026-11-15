import { describe, expect, it } from "vitest";
import type { Card } from "../../../../shared/types.ts";
import { cardStars, starLabel } from "./stars.ts";

const card = (p: Partial<Card>): Card => ({ id: 1, name: "X", type: "Effect Monster", kind: null, category: "Monster", race: null, attribute: null, level: 4, atk: 1000, defense: 1000,
  linkval: null, linkmarkers: null, scale: null, archetype: null, desc: "", tcg_date: null, ocg_date: null, release_date: null, konami_id: null, staple: null, views: null,
  viewsweek: null, upvotes: null, downvotes: null, ban_tcg: null, ban_ocg: null, ...p } as Card);

describe("card stars (who gets the splash)", () => {
  it("ranks icons, power cards and popular cards above routine ones", () => {
    expect(cardStars(card({ name: "Dark Magician", views: 4_679_229 }))).toBe(3);                                         // icon
    expect(cardStars(card({ name: "Ash Blossom & Joyous Spring", views: 26_136_929, staple: 1, ban_ocg: "Semi-Limited" }))).toBe(3);
    expect(cardStars(card({ name: "Pot of Greed", views: 2_287_741, ban_tcg: "Forbidden" }))).toBe(3);
    expect(cardStars(card({ name: "Kewl Tune Reco", views: 422_746, ban_ocg: "Limited" }))).toBe(2);                    // popular-ish + limited
    expect(cardStars(card({ name: "Some Monster", views: 1_200_000 }))).toBe(2);                                         // popular
    expect(cardStars(card({ name: "Gene-Warped Warwolf", views: 156_722 }))).toBe(1);                                   // routine
    expect(cardStars(null)).toBe(1);
  });
  it("says why", () => {
    expect(starLabel(card({ name: "Blue-Eyes White Dragon" }))).toBe("Legendary");
    expect(starLabel(card({ name: "Called by the Grave", staple: 1, ban_tcg: "Forbidden" }))).toBe("Forbidden-class");
    expect(starLabel(card({ name: "Infinite Impermanence", staple: 1, views: 17_599_404 }))).toBe("Staple");
    expect(starLabel(card({ name: "Gene-Warped Warwolf" }))).toBeNull();
  });
});
