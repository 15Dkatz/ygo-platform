// Built-in starter decks, offered to everyone (guests and new players included) in the duel / lobby
// deck pickers, so a duel can start without building a deck first. Every card is in the rules engine's
// data (BabelCDB) with a script where it has an effect, and none is a Skill card: checked against the
// local engine_cards table when these lists were made. 40-card Main Decks; the Synchro and Xyz decks
// carry Extra Decks of monsters their Main Decks can actually make (engine.test.ts summons them).
import type { Deck } from "./types.ts";

const STAMP = "2026-11-12T00:00:00.000Z";
const n = (id: number, copies: number) => Array<number>(copies).fill(id);

const deck = (id: string, name: string, main: number[], extra: number[] = []): Deck =>
  ({ id: `starter:${id}`, name, main, extra, side: [], created_at: STAMP, updated_at: STAMP });

export const STARTER_DECKS: Deck[] = [
  deck("warrior", "Starter: Warrior Beatdown", [
    ...n(69247929, 3), // Gene-Warped Warwolf
    ...n(43096270, 2), // Alexandrite Dragon
    ...n(91152256, 3), // Celtic Guardian
    ...n(69140098, 3), // Gemini Elf
    ...n(13039848, 2), // Giant Soldier of Stone
    ...n(15025844, 2), // Mystical Elf
    ...n(70781052, 2), // Summoned Skull
    ...n(39256679, 3), // Beta The Magnet Warrior
    ...n(53129443, 1), // Dark Hole
    ...n(12580477, 1), // Raigeki
    ...n(83764718, 1), // Monster Reborn
    ...n(72302403, 1), // Swords of Revealing Light
    ...n(5318639, 2),  // Mystical Space Typhoon
    ...n(40619825, 2), // Axe of Despair
    ...n(70046172, 2), // Rush Recklessly
    ...n(44095762, 1), // Mirror Force
    ...n(4206964, 2),  // Trap Hole
    ...n(29401950, 1), // Bottomless Trap Hole
    ...n(56120475, 2), // Sakuretsu Armor
    ...n(62279055, 1), // Magic Cylinder
    ...n(14315573, 1), // Negate Attack
    ...n(12607053, 2), // Waboku
  ]),
  deck("dragon", "Starter: Dragon Power", [
    ...n(89631139, 3), // Blue-Eyes White Dragon
    ...n(11091375, 3), // Luster Dragon
    ...n(43096270, 3), // Alexandrite Dragon
    ...n(17985575, 2), // Lord of D.
    ...n(17444133, 2), // Kaiser Sea Horse
    ...n(15960641, 2), // Mirage Dragon
    ...n(31553716, 3), // Spear Dragon
    ...n(11125718, 2), // Lancer Dragonute
    ...n(53129443, 1), // Dark Hole
    ...n(83764718, 1), // Monster Reborn
    ...n(19613556, 1), // Heavy Storm
    ...n(43973174, 2), // The Flute of Summoning Dragon
    ...n(5318639, 2),  // Mystical Space Typhoon
    ...n(81385346, 2), // Stamping Destruction
    ...n(1435851, 2),  // Dragon Treasure
    ...n(44095762, 1), // Mirror Force
    ...n(4206964, 2),  // Trap Hole
    ...n(54178050, 2), // Dragon's Rage
    ...n(62279055, 1), // Magic Cylinder
    ...n(56120475, 2), // Sakuretsu Armor
    ...n(97077563, 1), // Call of the Haunted
  ]),
  deck("synchro", "Starter: Synchro Warriors", [
    ...n(63977008, 3), // Junk Synchron (Tuner, Lv3)
    ...n(68505803, 3), // Genex Controller (Tuner, Lv3)
    ...n(9365703, 3),  // Speed Warrior (Lv2)
    ...n(69247929, 3), // Gene-Warped Warwolf (Lv4)
    ...n(91152256, 2), // Celtic Guardian (Lv4)
    ...n(69140098, 2), // Gemini Elf (Lv4)
    ...n(43096270, 2), // Alexandrite Dragon (Lv4)
    ...n(32807846, 2), // Reinforcement of the Army
    ...n(83764718, 1), // Monster Reborn
    ...n(53129443, 1), // Dark Hole
    ...n(5318639, 2),  // Mystical Space Typhoon
    ...n(70046172, 2), // Rush Recklessly
    ...n(40619825, 1), // Axe of Despair
    ...n(72302403, 1), // Swords of Revealing Light
    ...n(44095762, 1), // Mirror Force
    ...n(4206964, 2),  // Trap Hole
    ...n(56120475, 2), // Sakuretsu Armor
    ...n(12607053, 2), // Waboku
    ...n(97077563, 2), // Call of the Haunted
    ...n(62279055, 1), // Magic Cylinder
    ...n(14315573, 2), // Negate Attack
  ], [
    ...n(60800381, 2), // Junk Warrior (Lv5: Junk Synchron + Speed Warrior)
    ...n(73580471, 1), // Black Rose Dragon (Lv7: Lv3 Tuner + Lv4)
    ...n(25862681, 1), // Ancient Fairy Dragon (Lv7)
    ...n(82044279, 1), // Clear Wing Synchro Dragon (Lv7)
  ]),
  deck("xyz", "Starter: Rank 4 Xyz", [
    ...n(69247929, 3), // Gene-Warped Warwolf
    ...n(43096270, 3), // Alexandrite Dragon
    ...n(91152256, 3), // Celtic Guardian
    ...n(69140098, 3), // Gemini Elf
    ...n(39256679, 2), // Beta The Magnet Warrior
    ...n(2460565, 2),  // Marauding Captain
    ...n(15025844, 2), // Mystical Elf
    ...n(43422537, 3), // Double Summon
    ...n(83764718, 1), // Monster Reborn
    ...n(53129443, 1), // Dark Hole
    ...n(5318639, 2),  // Mystical Space Typhoon
    ...n(70046172, 2), // Rush Recklessly
    ...n(72302403, 1), // Swords of Revealing Light
    ...n(44095762, 1), // Mirror Force
    ...n(4206964, 2),  // Trap Hole
    ...n(56120475, 2), // Sakuretsu Armor
    ...n(12607053, 2), // Waboku
    ...n(97077563, 2), // Call of the Haunted
    ...n(62279055, 1), // Magic Cylinder
    ...n(14315573, 2), // Negate Attack
  ], [
    ...n(84013237, 2), // Number 39: Utopia (Rank 4)
    ...n(71594310, 2), // Gem-Knight Pearl (Rank 4)
    ...n(581014, 1),   // Daigusto Emeral (Rank 4)
    ...n(46772449, 1), // Evilswarm Exciton Knight (Rank 4)
    ...n(95169481, 1), // Diamond Dire Wolf (Rank 4)
  ]),
];

export const isStarterDeck = (id: string) => id.startsWith("starter:");

/** Demo duels: a starter deck whose opening hand holds a combo (the rest shuffled), for rooms whose
 *  decks keep their order. Synchro: Genex Controller (Tuner, Lv3) + Gene-Warped Warwolf (Lv4) +
 *  Double Summon -> a Level 7 Synchro. Xyz: two Level 4s + Double Summon -> a Rank 4. */
const DEMO_OPENING: Record<"synchro" | "xyz", number[]> = {
  synchro: [68505803, 69247929, 43422537, 56120475, 12607053],   // Genex Controller, Warwolf, Double Summon, Sakuretsu Armor, Waboku
  xyz: [69247929, 43096270, 43422537, 4206964, 12607053],        // Warwolf, Alexandrite Dragon, Double Summon, Trap Hole, Waboku
};
export function demoDeck(kind: "synchro" | "xyz", rng: () => number = Math.random): Deck {
  const base = STARTER_DECKS.find((d) => d.id === `starter:${kind}`)!;
  const rest = [...base.main];
  for (const code of DEMO_OPENING[kind]) {
    const i = rest.indexOf(code);
    rest.splice(i >= 0 ? i : rest.length - 1, 1);   // a card the starter lacks replaces its last card
  }
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return { ...base, id: `demo:${kind}`, name: `Demo: ${base.name.replace("Starter: ", "")}`, main: [...DEMO_OPENING[kind], ...rest] };
}
