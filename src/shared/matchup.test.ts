import { describe, expect, it } from "vitest";
import { attackOutcome } from "./matchup.ts";

const m = (atk: number, def = 0, position = "atk", faceUp = true) => ({ atk, def, position, faceUp });

describe("attack outcome preview", () => {
  it("vs Attack Position: higher ATK wins and deals the difference", () => {
    expect(attackOutcome(m(2500), m(1800))).toEqual({ text: "Destroys it · 700 damage", tone: "good" });
    expect(attackOutcome(m(1800), m(1800)).tone).toBe("even");
    expect(attackOutcome(m(1500), m(2000))).toEqual({ text: "Yours is destroyed · you take 500", tone: "bad" });
  });
  it("vs Defense Position: no damage when it's destroyed, you take the difference when it holds", () => {
    expect(attackOutcome(m(2000), m(0, 1500, "def")).text).toBe("Destroys it · no damage");
    expect(attackOutcome(m(1500), m(0, 1500, "def")).tone).toBe("even");
    expect(attackOutcome(m(1000), m(0, 2000, "def"))).toEqual({ text: "Bounces off · you take 1000", tone: "bad" });
  });
  it("face-down targets are unknown", () => {
    expect(attackOutcome(m(3000), m(0, 0, "faceDownDef", false)).tone).toBe("unknown");
  });
});
