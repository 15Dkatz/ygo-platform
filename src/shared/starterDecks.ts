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
  // ---- advanced test decks: long chains, hand traps, GY / banish / Extra Deck navigation ----
  deck("kewl", "Starter: Kewl Tune Synchro", [
    ...n(89392810, 3), // Kewl Tune Reco (Tuner, Lv3)
    ...n(16509007, 3), // Kewl Tune Mix (Tuner, Lv2)
    ...n(16387555, 3), // Kewl Tune Cue (Tuner, Lv3)
    ...n(43904702, 3), // Kewl Tune Clip (Tuner, Lv2)
    ...n(14558127, 3), // Ash Blossom & Joyous Spring
    ...n(73642296, 2), // Ghost Belle & Haunted Mansion
    ...n(97268402, 2), // Effect Veiler
    ...n(14442329, 3), // JJ "Kewl Tune"
    ...n(78058681, 3), // Kewl Tune Synchro
    ...n(84211599, 1), // Pot of Prosperity
    ...n(49238328, 2), // Pot of Extravagance
    ...n(81439173, 1), // Foolish Burial
    ...n(14087893, 2), // Book of Moon
    ...n(8267140, 2),  // Cosmic Cyclone
    ...n(24299458, 1), // Forbidden Droplet
    ...n(14532163, 1), // Lightning Storm
    ...n(40847034, 2), // Kewl Tune Playlist
    ...n(10045474, 3), // Infinite Impermanence
  ], [
    ...n(15665977, 2), // Kewl Tune RS (Synchro Tuner, Lv5)
    ...n(88170262, 2), // Kewl Tune Remix (Lv5)
    ...n(39576656, 2), // Kewl Tune Crackle (Lv5)
    ...n(41069676, 2), // Kewl Tune Loudness War (Lv6)
    ...n(42781164, 2), // Kewl Tune Track Maker (Lv4)
    ...n(65961304, 2), // Kewl Tune B2B (Lv10)
    ...n(37675907, 1), // Accel Synchron
    ...n(50091196, 1), // Formula Synchron
  ]),
  deck("branded", "Starter: Branded Despia Fusion", [
    ...n(68468459, 3), // Fallen of Albaz
    ...n(62962630, 3), // Aluber the Jester of Despia
    ...n(36577931, 2), // Despian Tragedy
    ...n(90179822, 1), // Despian Comedy
    ...n(99456344, 1), // Dramaturge of Despia
    ...n(81555617, 1), // Ad Libitum of Despia
    ...n(45883110, 2), // Guiding Quem, the Virtuous
    ...n(19096726, 1), // Tri-Brigade Mercourier
    ...n(14558127, 3), // Ash Blossom & Joyous Spring
    ...n(73642296, 2), // Ghost Belle & Haunted Mansion
    ...n(44362883, 1), // Branded Fusion
    ...n(36637374, 1), // Branded Opening
    ...n(82738008, 2), // Branded in Red
    ...n(18973184, 1), // Branded Lost
    ...n(99543666, 1), // Despia, Theater of the Branded
    ...n(29948294, 1), // Branded in High Spirits
    ...n(81439173, 1), // Foolish Burial
    ...n(84211599, 1), // Pot of Prosperity
    ...n(54693926, 1), // Dark Ruler No More
    ...n(8267140, 2),  // Cosmic Cyclone
    ...n(14087893, 2), // Book of Moon
    ...n(17751597, 2), // Branded Retribution
    ...n(6763530, 2),  // Branded Banishment
    ...n(10045474, 3), // Infinite Impermanence
  ], [
    ...n(44146295, 1), // Mirrorjade the Iceblade Dragon
    ...n(70534340, 1), // Lubellion the Searing Dragon
    ...n(41373230, 2), // Titaniklad the Ash Dragon
    ...n(24915933, 1), // Granguignol the Dusk Dragon
    ...n(51409648, 1), // Rindbrumm the Striking Dragon
    ...n(72272462, 1), // Despian Quaeritis
    ...n(18666161, 1), // Despian Proskenion
    ...n(6855503, 1),  // Masquerade the Blazing Dragon
    ...n(34848821, 2), // Brigrand the Glory Dragon
    ...n(1906812, 1),  // Sprind the Irondash Dragon
    ...n(3410461, 1),  // Alba-Lenatus the Abyss Dragon
  ]),
];

// a few foils in the advanced decks, to show the rarities off
const FOILS: Record<string, Deck["rarity"]> = {
  "starter:kewl": { 89392810: "starlight", 16509007: "prismatic", 16387555: "gold", 43904702: "ghost", 78058681: "platinum", 14558127: "ultra", 14442329: "super", 15665977: "ultra", 65961304: "starlight", 10045474: "rare" },
  "starter:branded": { 68468459: "starlight", 62962630: "secret", 36577931: "ultimate", 45883110: "collector", 90179822: "platinum", 99543666: "gold", 44362883: "ultra", 14558127: "ultra", 44146295: "starlight", 41373230: "super", 17751597: "rare" },
};
for (const d of STARTER_DECKS) if (FOILS[d.id]) d.rarity = FOILS[d.id];

export const isStarterDeck = (id: string) => id.startsWith("starter:");

/** Demo duels: a starter deck whose opening hand holds a combo (the rest shuffled), for rooms whose
 *  decks keep their order. Synchro: Genex Controller (Tuner, Lv3) + Gene-Warped Warwolf (Lv4) +
 *  Double Summon -> a Level 7 Synchro. Xyz: two Level 4s + Double Summon -> a Rank 4. */
const DEMO_OPENING: Record<"synchro" | "xyz" | "kewl" | "branded", number[]> = {
  synchro: [68505803, 69247929, 43422537, 56120475, 12607053],   // Genex Controller, Warwolf, Double Summon, Sakuretsu Armor, Waboku
  xyz: [69247929, 43096270, 43422537, 4206964, 12607053],        // Warwolf, Alexandrite Dragon, Double Summon, Trap Hole, Waboku
  kewl: [89392810, 16509007, 14442329, 14558127, 10045474],      // Reco, Mix, JJ "Kewl Tune", Ash Blossom, Infinite Impermanence
  branded: [68468459, 44362883, 62962630, 14558127, 17751597],   // Fallen of Albaz, Branded Fusion, Aluber, Ash Blossom, Branded Retribution
};
export type DemoKind = keyof typeof DEMO_OPENING;
export function demoDeck(kind: DemoKind, rng: () => number = Math.random): Deck {
  const base = STARTER_DECKS.find((d) => d.id === `starter:${kind}`)!;
  const rest = [...base.main];
  for (const code of DEMO_OPENING[kind]) {
    const i = rest.indexOf(code);
    rest.splice(i >= 0 ? i : rest.length - 1, 1);   // a card the starter lacks replaces its last card
  }
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return { ...base, id: `demo:${kind}`, name: `Demo: ${base.name.replace("Starter: ", "")}`, main: [...DEMO_OPENING[kind], ...rest] };
}
