// "Which Normal Summon do you use?": with JJ "Kewl Tune" on the field, Normal Summoning a Tuner asks
// whether to use the regular Normal Summon or JJ's extra one. Both choices must read in plain words
// (the engine names the regular one with a bare system string, which used to show as "#1").
import { describe, expect, it } from "vitest";
import type { EnginePrompt } from "../../../shared/enginePrompts.ts";
import { grantedFrom, summonChoice } from "./decode.ts";
import { engineDataAvailable } from "./testHarness.ts";
import { Player } from "./comboHarness.ts";

describe("summon choice labels", () => {
  it("names the regular and the extra Normal Summon", () => {
    const p = summonChoice([{ raw: 1, text: "Option 1" }, { raw: 14442329n << 20n, text: 'Normal Summon ("JJ "Kewl Tune"")' }]);
    expect(p.options).toEqual(["Use your regular Normal Summon", 'Use the extra Normal Summon from JJ "Kewl Tune"']);
    expect(p.hint).toBe("Which Normal Summon do you use?");
  });
  it("leaves other option prompts alone", () => {
    expect(summonChoice([{ raw: 573, text: "Add it to your hand" }, { raw: 574, text: "Send it to the GY" }]).options)
      .toEqual(["Add it to your hand", "Send it to the GY"]);
  });

  it("knows when an effect's text belongs to another card (a granted effect)", () => {
    const JJ = 14442329, RECO = 89392810;
    expect(grantedFrom((BigInt(JJ) << 20n) | 1n, RECO)).toBe(JJ);     // JJ's effect offered on Reco
    expect(grantedFrom((BigInt(RECO) << 20n) | 0n, RECO)).toBeUndefined();   // Reco's own effect
    expect(grantedFrom(1160, RECO)).toBeUndefined();                    // a system string
    expect(grantedFrom((BigInt(JJ) << 20n) | 1n, 0)).toBeUndefined();     // a hidden card
  });
  it.skipIf(!engineDataAvailable)("in a real duel: JJ \"Kewl Tune\" + a Tuner", async () => {
    const JJ = 14442329, RECO = 89392810;
    const p = await Player.start({ hand: [JJ, RECO] });
    await p.act("activate", JJ);
    // summon by hand, step by step, to see the question
    const duel = (p as unknown as { duel: { prompt: EnginePrompt; respond(seat: 0 | 1, r: unknown): Promise<unknown> } }).duel;
    const idle = p.idle;
    await duel.respond(0, { promptId: idle.id, kind: "idle", action: "summon", index: idle.summons.findIndex((c) => c.code === RECO) });
    const q = duel.prompt;
    expect(q.kind).toBe("option");
    if (q.kind !== "option") return;
    expect(q.options.some((o) => /#\d/.test(o))).toBe(false);
    expect(q.options).toContain("Use your regular Normal Summon");
    expect(q.options.some((o) => /extra Normal Summon from JJ/.test(o))).toBe(true);
    expect(q.hint).toBe("Which Normal Summon do you use?");
  }, 120_000);
});
