import type { Card, Category } from "./types.ts";

/** Friendly sub-category (port of derive_kind). */
export function deriveKind(cardType: string | null | undefined, race: string | null | undefined): string {
  const t = cardType || "";
  if (t.includes("Spell") || t.includes("Trap")) return race || "Normal";
  const keys: [string, string][] = [
    ["Link", "Link"], ["XYZ", "Xyz"], ["Synchro", "Synchro"], ["Fusion", "Fusion"],
    ["Ritual", "Ritual"], ["Pendulum", "Pendulum"], ["Token", "Token"], ["Skill", "Skill"],
  ];
  for (const [k, label] of keys) if (t.includes(k)) return label;
  if (t.includes("Normal")) return "Normal";
  if (t.includes("Effect")) return "Effect";
  return "Other";
}

/** Raw YGOPRODeck cardinfo.php record -> catalogue Card + every alias id (port of normalize_card). */
export function normalizeCard(raw: any): { card: Card; aliases: number[] } {
  const misc = (raw.misc_info && raw.misc_info[0]) || {};
  const tcg: string | null = misc.tcg_date ?? null;
  const ocg: string | null = misc.ocg_date ?? null;
  const dates = [tcg, ocg].filter(Boolean) as string[];
  const ctype: string = raw.type || "";
  const category: Category = ctype.includes("Spell") ? "Spell" : ctype.includes("Trap") ? "Trap" : "Monster";
  const images: any[] = raw.card_images || [];
  const aliases = [...new Set<number>([raw.id, ...images.map((i) => i.id).filter((x: unknown) => typeof x === "number")])].sort((a, b) => a - b);
  const ban = raw.banlist_info || {};
  const card: Card = {
    id: raw.id,
    name: raw.name ?? `Unknown ${raw.id}`,
    type: ctype || null,
    kind: deriveKind(ctype, raw.race),
    category,
    race: raw.race ?? null,
    attribute: raw.attribute ?? null,
    level: raw.level ?? null,
    atk: raw.atk ?? null,
    defense: raw.def ?? null,
    linkval: raw.linkval ?? null,
    linkmarkers: raw.linkmarkers ?? null,
    scale: raw.scale ?? null,
    archetype: raw.archetype ?? null,
    desc: raw.desc ?? null,
    tcg_date: tcg,
    ocg_date: ocg,
    release_date: dates.length ? dates.sort()[0] : null,
    konami_id: misc.konami_id ?? null,
    staple: ["yes", "true", "1"].includes(String(misc.staple ?? "").toLowerCase()) ? 1 : 0,
    views: misc.views ?? null,
    viewsweek: misc.viewsweek ?? null,
    upvotes: misc.upvotes ?? null,
    downvotes: misc.downvotes ?? null,
    ban_tcg: ban.ban_tcg ?? null,
    ban_ocg: ban.ban_ocg ?? null,
    ban_goat: ban.ban_goat ?? null,
  };
  return { card, aliases };
}

export const CARD_COLUMNS: (keyof Card)[] = [
  "id", "name", "type", "kind", "category", "race", "attribute", "level", "atk", "defense",
  "linkval", "linkmarkers", "scale", "archetype", "desc", "tcg_date", "ocg_date", "release_date",
  "konami_id", "staple", "views", "viewsweek", "upvotes", "downvotes", "ban_tcg", "ban_ocg", "ban_goat",
];

/** D1 row -> Card (linkmarkers is stored as JSON text). */
export function rowToCard(row: Record<string, unknown>): Card {
  const c = { ...row } as any;
  c.linkmarkers = typeof row.linkmarkers === "string" ? JSON.parse(row.linkmarkers) : null;
  return c as Card;
}
