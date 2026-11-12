// Rules-enforced duels are regular Yu-Gi-Oh! only: Skill cards (Speed Duel / Duel Links) can't be
// played. They're marked "Skill Card" in the catalogue (YGOPRODeck `cards`); the engine's own data
// (`engine_cards`) mostly lacks them, and would play an unknown card as a blank one. So the room
// checks decks against both tables before seating anyone.

export const TYPE_SKILL = 0x8000000;

/** The Skill cards in `ids` (distinct), by either card table. Fails open (empty) if the lookup fails. */
export async function skillCardsIn(db: D1Database | undefined, ids: number[]): Promise<{ id: number; name: string }[]> {
  const unique = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))];
  if (!db || !unique.length) return [];
  const found: { id: number; name: string }[] = [];
  try {
    for (let i = 0; i < unique.length; i += 45) {   // each id is bound twice; D1 allows 100 parameters
      const chunk = unique.slice(i, i + 45);
      const marks = chunk.map(() => "?").join(",");
      const r = await db.prepare(
        `SELECT id, name FROM cards WHERE id IN (${marks}) AND type = 'Skill Card' ` +
        `UNION SELECT id, name FROM engine_cards WHERE id IN (${marks}) AND (type & ${TYPE_SKILL}) != 0`)
        .bind(...chunk, ...chunk).all<{ id: number; name: string }>();
      for (const row of r.results) if (!found.some((f) => f.id === row.id)) found.push(row);
    }
  } catch (e) {
    console.error("skill card check", e);
    return [];
  }
  return found;
}

/** The error to show for a deck with Skill cards in it, or null. */
export async function skillCardProblem(db: D1Database | undefined, deck: { main: number[]; extra: number[]; side?: number[] }): Promise<string | null> {
  const skills = await skillCardsIn(db, [...deck.main, ...deck.extra, ...(deck.side ?? [])]);
  if (!skills.length) return null;
  const names = skills.map((s) => s.name || `#${s.id}`).slice(0, 5).join(", ");
  return `Skill cards can't be used in rules-enforced duels (regular Yu-Gi-Oh! only): ${names}${skills.length > 5 ? "…" : ""}. Remove ${skills.length === 1 ? "it" : "them"} from the deck, or play a manual duel.`;
}
