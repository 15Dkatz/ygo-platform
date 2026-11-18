import type { Card, Deck } from "./types.ts";
import { GENESYS_ADDITIONS } from "./genesysAdditions.ts";
import { GENESYS_POINTS } from "./genesysPoints.ts";

export type DeckFormat = "genesys" | "tcg" | "ocg" | "none";
export const FORMAT_LABEL: Record<DeckFormat, string> = {
  genesys: "Genesys (latest TCG)", tcg: "TCG", ocg: "OCG", none: "No ban list",
};
const normalizeName = (name: string) => name.normalize("NFKC").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").toLowerCase();
// The main table takes precedence once it incorporates or revises the additions.
const points = new Map(Object.entries({ ...GENESYS_ADDITIONS, ...GENESYS_POINTS }).map(([name, n]) => [normalizeName(name), n]));
/** Unknown catalogue cards are not assumed to cost zero. */
export function genesysPoints(card: Card): number | null {
  return card.category === "Unknown" ? null : points.get(normalizeName(card.name)) ?? 0;
}
export function genesysSummary(deck: Pick<Deck, "main" | "extra" | "side">, get: (id: number) => Card) {
  const sections = { main: 0, extra: 0, side: 0 };
  let unknown = 0;
  for (const section of ["main", "extra", "side"] as const) for (const id of deck[section]) {
    const n = genesysPoints(get(id));
    if (n === null) unknown++; else sections[section] += n;
  }
  return { ...sections, total: sections.main + sections.extra + sections.side, unknown };
}
export const genesysExcluded = (card: Card) => /Link|Pendulum/i.test(card.type ?? "");
