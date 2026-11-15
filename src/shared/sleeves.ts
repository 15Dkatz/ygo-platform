// Card sleeves: the back of every card in a deck (hand, Deck, face-down cards), picked per deck in the deck
// builder, saved with it, sent with it to a duel and seen by both players.
//   "design:<id>"  one of our designs (colours + a pattern under the emblem)
//   "art:<code>"   a card's artwork in a sleeve frame (popular cards, or any card in the deck)
//   "scene:<code>" a card's artwork as a full-bleed background (Field Spells and other scenery)

/** kind "scene": a painted background with a thin border instead of the emblem. */
export interface SleeveDesign { id: string; label: string; kind?: "scene" }
export const SLEEVE_DESIGNS: SleeveDesign[] = [
  { id: "classic", label: "Arcane (classic)" },
  { id: "midnight", label: "Midnight" },
  { id: "crimson", label: "Crimson" },
  { id: "emerald", label: "Emerald" },
  { id: "royal", label: "Royal violet" },
  { id: "gold", label: "Gold filigree" },
  { id: "obsidian", label: "Obsidian" },
  { id: "ice", label: "Glacier" },
  { id: "flame", label: "Inferno" },
  { id: "ocean", label: "Ocean waves" },
  { id: "sakura", label: "Sakura" },
  { id: "starfield", label: "Starfield" },
  { id: "circuit", label: "Circuit" },
  { id: "carbon", label: "Carbon" },
  { id: "checker", label: "Duelist checker" },
  { id: "holo", label: "Holographic" },
  { id: "parchment", label: "Old parchment" },
  { id: "jade", label: "Jade dragon" },
  // painted backgrounds (CSS, sleeves.css)
  { id: "aurora", label: "Aurora sky", kind: "scene" },
  { id: "nebula", label: "Nebula", kind: "scene" },
  { id: "sunset", label: "Sunset dunes", kind: "scene" },
  { id: "abyss", label: "Abyssal sea", kind: "scene" },
  { id: "volcano", label: "Volcano", kind: "scene" },
  { id: "storm", label: "Thunderstorm", kind: "scene" },
  { id: "eclipse", label: "Eclipse", kind: "scene" },
  { id: "twilight", label: "Twilight peaks", kind: "scene" },
  { id: "sakurasky", label: "Spring dusk", kind: "scene" },
  { id: "void", label: "Shadow realm", kind: "scene" },
];

/** Card artwork that works as a background: Field Spells and other scenery. */
export const SCENE_SLEEVES: { code: number; label: string }[] = [
  { code: 22702055, label: "Umi" },
  { code: 295517, label: "A Legendary Ocean" },
  { code: 59197169, label: "Yami" },
  { code: 86318356, label: "Sogen" },
  { code: 50913601, label: "Mountain" },
  { code: 87430998, label: "Forest" },
  { code: 23424603, label: "Wasteland" },
  { code: 56594520, label: "Gaia Power" },
  { code: 19384334, label: "Molten Destruction" },
  { code: 45778932, label: "Rising Air Current" },
  { code: 81777047, label: "Luminous Spark" },
  { code: 18161786, label: "Mystic Plasma Zone" },
  { code: 63035430, label: "Skyscraper" },
  { code: 53527835, label: "Dark City" },
  { code: 47355498, label: "Necrovalley" },
  { code: 62265044, label: "Dragon Ravine" },
  { code: 56433456, label: "The Sanctuary in the Sky" },
  { code: 34487429, label: "Ancient City - Rainbow Ruins" },
  { code: 39910367, label: "Magical Citadel of Endymion" },
  { code: 68462976, label: "Secret Village of the Spellcasters" },
  { code: 4064256, label: "Zombie World" },
  { code: 70222318, label: "Mount Sylvania" },
  { code: 59160188, label: "Lair of Darkness" },
  { code: 37694547, label: "Geartown" },
  { code: 80921533, label: "Mausoleum of the Emperor" },
  { code: 78082039, label: "Closed Forest" },
  { code: 87624166, label: "Ancient Forest" },
  { code: 77103950, label: "Primeval Planet Perlereino" },
  { code: 13035077, label: "Dragonic Diagram" },
  { code: 44352516, label: "Cyberdark Inferno" },
  { code: 48179391, label: "The Seal of Orichalcos" },
  { code: 79698395, label: "Realm of Danger!" },
  { code: 43175858, label: "Toon Kingdom" },
  { code: 99266988, label: "Chaos Space" },
  { code: 72302403, label: "Swords of Revealing Light" },
  { code: 63945693, label: "Rainbow Bridge" },
];

/** Popular cards whose artwork makes a good sleeve. */
export const POPULAR_SLEEVES: { code: number; label: string }[] = [
  { code: 89631139, label: "Blue-Eyes White Dragon" },
  { code: 46986420, label: "Dark Magician" },
  { code: 38033121, label: "Dark Magician Girl" },
  { code: 74677427, label: "Red-Eyes Black Dragon" },
  { code: 33396948, label: "Exodia the Forbidden One" },
  { code: 10000020, label: "Slifer the Sky Dragon" },
  { code: 10000000, label: "Obelisk the Tormentor" },
  { code: 10000010, label: "The Winged Dragon of Ra" },
  { code: 5405694, label: "Black Luster Soldier" },
  { code: 40640057, label: "Kuriboh" },
  { code: 70781052, label: "Summoned Skull" },
  { code: 44508094, label: "Stardust Dragon" },
  { code: 84013237, label: "Number 39: Utopia" },
  { code: 89943723, label: "Elemental HERO Neos" },
  { code: 70095154, label: "Cyber Dragon" },
  { code: 86066372, label: "Accesscode Talker" },
  { code: 5043010, label: "Firewall Dragon" },
  { code: 14558127, label: "Ash Blossom & Joyous Spring" },
  { code: 73642296, label: "Ghost Belle & Haunted Mansion" },
  { code: 26077387, label: "Sky Striker Ace - Raye" },
  { code: 68468459, label: "Fallen of Albaz" },
  { code: 9674034, label: "Snake-Eye Ash" },
  { code: 55144522, label: "Pot of Greed" },
  { code: 83764719, label: "Monster Reborn" },
  { code: 44095762, label: "Mirror Force" },
  { code: 24094653, label: "Polymerization" },
];

export type Sleeve = `design:${string}` | `art:${number}` | `scene:${number}`;
export const DEFAULT_SLEEVE: Sleeve = "design:classic";

/** A valid sleeve value, or the default. */
export function cleanSleeve(raw: unknown): Sleeve {
  if (typeof raw !== "string") return DEFAULT_SLEEVE;
  const d = /^design:([a-z]+)$/.exec(raw);
  if (d && SLEEVE_DESIGNS.some((x) => x.id === d[1])) return raw as Sleeve;
  if (/^(art|scene):\d{3,10}$/.test(raw)) return raw as Sleeve;
  return DEFAULT_SLEEVE;
}

export function sleeveLabel(s: string | undefined | null, cardName?: (code: number) => string | undefined): string {
  const v = cleanSleeve(s);
  if (v.startsWith("design:")) return SLEEVE_DESIGNS.find((d) => `design:${d.id}` === v)?.label ?? "Classic";
  const code = Number(v.slice(v.indexOf(":") + 1));
  if (v.startsWith("scene:")) return `${SCENE_SLEEVES.find((p) => p.code === code)?.label ?? cardName?.(code) ?? "Card"} (background)`;
  return `${POPULAR_SLEEVES.find((p) => p.code === code)?.label ?? cardName?.(code) ?? "Card"} art`;
}
