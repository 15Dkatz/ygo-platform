// Two simple 40-card decks (vanilla beaters + classic staples) used by the engine tests and
// imported by default by scripts/import-engine-data.ts. Codes are Konami passcodes.

const n = (code: number, copies: number) => Array<number>(copies).fill(code);

/** "Classic Beatdown": Normal Monsters, removal, Scapegoat (tokens), basic traps. */
export const TEST_DECK_A = {
  name: "Classic Beatdown",
  main: [
    ...n(89631139, 2),  // Blue-Eyes White Dragon
    ...n(70781052, 2),  // Summoned Skull
    ...n(6368038, 2),   // Gaia The Fierce Knight
    ...n(91152256, 3),  // Celtic Guardian
    ...n(97590747, 3),  // La Jinn the Mystical Genie of the Lamp
    ...n(13039848, 3),  // Giant Soldier of Stone
    ...n(32452818, 3),  // Beaver Warrior
    ...n(15025844, 3),  // Mystical Elf
    ...n(5053103, 3),   // Battle Ox
    53129443,           // Dark Hole
    12580477,           // Raigeki
    55144522,           // Pot of Greed
    83764718,           // Monster Reborn
    ...n(5318639, 2),   // Mystical Space Typhoon
    ...n(73915051, 2),  // Scapegoat
    72302403,           // Swords of Revealing Light
    ...n(4206964, 2),   // Trap Hole
    ...n(56120475, 2),  // Sakuretsu Armor
    44095762,           // Mirror Force
    60082869,           // Dust Tornado
    19523799,           // Ookazi
  ],
  extra: [] as number[],
};

/** "Dragons & Flips": vanilla dragons, flip effects, searchers, LP gain/burn. */
export const TEST_DECK_B = {
  name: "Dragons & Flips",
  main: [
    ...n(46986414, 2),  // Dark Magician
    ...n(28279543, 2),  // Curse of Dragon
    ...n(43096270, 3),  // Alexandrite Dragon
    ...n(69247929, 3),  // Gene-Warped Warwolf
    ...n(11091375, 3),  // Luster Dragon
    ...n(14898066, 3),  // Vorse Raider
    ...n(83011277, 2),  // Mystic Tomato
    26202165,           // Sangan
    ...n(54652250, 2),  // Man-Eater Bug
    7089711,            // Hane-Hane
    ...n(66788016, 2),  // Fissure
    26412047,           // Hammer Shot
    83764718,           // Monster Reborn
    55144522,           // Pot of Greed
    84257639,           // Dian Keto the Cure Master
    24094653,           // Polymerization
    ...n(70046172, 2),  // Rush Recklessly
    ...n(14087893, 2),  // Book of Moon
    62279055,           // Magic Cylinder
    14315573,           // Negate Attack
    12607053,           // Waboku
    ...n(17814387, 2),  // Reinforcements
    97077563,           // Call of the Haunted
    53129443,           // Dark Hole
  ],
  extra: [
    41462083,           // Thousand Dragon
    45231177,           // Flame Swordsman
  ],
};

export const TEST_DECKS = [TEST_DECK_A, TEST_DECK_B];
