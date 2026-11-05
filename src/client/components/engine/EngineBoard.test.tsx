// Server-side render of the board layer for each prompt shape: what ends up on the board
// (highlights), in the floating bar, in the position chooser, or in the fallback dialog.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BoardState, CardInstance } from "../../../shared/duel.ts";
import type { EnginePrompt } from "../../../shared/enginePrompts.ts";

vi.mock("./EnginePrompt.css", () => ({}));
const { useEngineBoard } = await import("./EngineBoard.tsx");

const card = (uid: string, code = 1, extra: Partial<CardInstance> = {}): CardInstance => ({ uid, code, owner: 0, faceUp: true, ...extra });
const player = (extra: Record<string, unknown> = {}) => ({ name: "", lp: 8000, deck: [], hand: [], extra: [], gy: [], banished: [],
  monster: [null, null, null, null, null], spelltrap: [null, null, null, null, null], field: null, pendulum: [null, null], ...extra });
const board: BoardState = {
  players: [
    player({ hand: [card("e0-2-0", 10), card("e0-2-1", 11)], gy: [card("e0-16-0", 12)], monster: [card("e0-4-0", 13, { position: "atk" }), null, null, null, null] }) as BoardState["players"][0],
    player({ monster: [null, card("e1-4-1", 0, { faceUp: false, position: "faceDownDef" }), null, null, null] }) as BoardState["players"][1],
  ],
  extraMonster: [null, null], turn: 1, turnPlayer: 0, phase: "main1", log: [],
};

function render(prompt: EnginePrompt) {
  let marks: ReturnType<typeof useEngineBoard>["marks"] | null = null;
  function Probe() {
    const e = useEngineBoard({
      prompt, board, you: 0, respond: () => {}, openMenu: () => {}, cardName: () => "Card", preview: () => {}, onHover: () => {},
      showMaterials: () => {}, toast: () => {},
    });
    marks = e.marks;
    return <div>{e.status}{e.overlay}</div>;
  }
  const html = renderToStaticMarkup(<Probe />);
  return { html, marks: marks! };
}
const ref = (location: "hand" | "monster" | "gy", sequence: number, controller: 0 | 1 = 0) => ({ code: 0, controller, location, sequence });

describe("engine prompts on the board", () => {
  it("idle: highlights cards with actions and leaves the panel out", () => {
    const { html, marks } = render({ id: 1, player: 0, kind: "idle", summons: [ref("hand", 1)], specialSummons: [], repositions: [ref("monster", 0)], monsterSets: [], spellSets: [], activates: [], canBattle: true, canEnd: true, canShuffle: false });
    expect([...marks.actionable].sort()).toEqual(["e0-2-1", "e0-4-0"]);
    expect(html).toContain("Your Main Phase");
    expect(html).not.toContain("engine-prompt__title");
  });
  it("selectCard: board highlight + floating bar; GY cards light up their pile", () => {
    const { html, marks } = render({ id: 2, player: 0, kind: "selectCard", min: 1, max: 2, canCancel: true, cards: [ref("monster", 1, 1), ref("gy", 0)], hint: "Select the card(s) to destroy" });
    expect([...marks.selectable]).toEqual(["e1-4-1", "e0-16-0"]);   // the GY card glows in the pile viewer
    expect(marks.piles.get("gy:0:")).toBe(1);
    expect(html).toContain("duel-engine-bar");
    expect(html).toContain("Select the card(s) to destroy");
    expect(html).toContain("Confirm");
    expect(html).toContain("Cancel");
  });
  it("selectPlace: open zones (with the shared EMZ) become clickable", () => {
    const { marks } = render({ id: 3, player: 0, kind: "selectPlace", count: 1, disabling: false, places: [{ controller: 0, location: "monster", sequence: 2 }, { controller: 0, location: "monster", sequence: 5 }] });
    expect([...marks.places].sort()).toEqual(["extraMonster:0", "monster:0:2"]);
  });
  it("selectPosition: the position chooser with the card art", () => {
    const { html } = render({ id: 4, player: 0, kind: "selectPosition", code: 89631139, positions: ["atk", "def", "faceDownDef"] });
    expect(html).toContain("duel-engine-pos");
    expect(html).toContain("/img/small/89631139.jpg");
    expect(html).toContain("Set (face-down Defense)");
  });
  it("yes/no prompts and stale refs fall back to the dialog panel", () => {
    expect(render({ id: 5, player: 0, kind: "yesNo", desc: "Attack directly?" }).html).toContain("duel-engine-dialog");
    const stale = render({ id: 6, player: 0, kind: "selectCard", min: 1, max: 1, canCancel: false, cards: [ref("monster", 4)] });
    expect(stale.html).toContain("duel-engine-dialog");   // nothing in Monster Zone 5: can't be shown on the board
  });
  it("the opponent's prompt shows nothing", () => {
    const { html, marks } = render({ id: 7, player: 1, kind: "yesNo", desc: "x" });
    expect(html).toBe("<div></div>");
    expect(marks.selectable.size).toBe(0);
  });
});
