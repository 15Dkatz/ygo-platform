// Decks are shuffled from the duel seed: different seeds deal different hands, the same seed the same.
import { describe, expect, it } from "vitest";
import { EngineDuel, shuffled, type DuelSetup } from "./EngineDuel.ts";
import { TEST_DECK_A, TEST_DECK_B } from "./testDecks.ts";
import { engineDataAvailable, nodeCore, nodeData } from "./testHarness.ts";

const seed = (n: number): DuelSetup["seed"] => [String(n), String(n * 31 + 7), String(n * 977 + 3), String(n * 7919 + 1)];

describe("deck shuffle", () => {
  it("is a deterministic permutation", () => {
    const a = shuffled(TEST_DECK_A.main, seed(1), 0);
    expect([...a].sort()).toEqual([...TEST_DECK_A.main].sort());
    expect(shuffled(TEST_DECK_A.main, seed(1), 0)).toEqual(a);
    expect(shuffled(TEST_DECK_A.main, seed(2), 0)).not.toEqual(a);
    expect(shuffled(TEST_DECK_A.main, seed(1), 1)).not.toEqual(a);
  });
  it.skipIf(!engineDataAvailable)("deals different opening hands for different seeds", async () => {
    const hands = new Set<string>();
    for (const n of [1, 2, 3]) {
      const d = await EngineDuel.create(await nodeCore(), nodeData().data, { seed: seed(n), decks: [TEST_DECK_A, TEST_DECK_B], first: 0 });
      hands.add(d.toBoardState(null).players[0].hand.map((c) => c.code).join());
    }
    expect(hands.size).toBeGreaterThan(1);
  });
});
