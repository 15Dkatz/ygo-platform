import type { Card } from "../../../shared/types.ts";

function tally<T extends string | number>(cards: Card[], key: (c: Card) => T | null | undefined): [T, number][] {
  const m = new Map<T, number>();
  for (const c of cards) { const k = key(c); if (k !== null && k !== undefined && k !== "") m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
}

function Bars<T extends string | number>({ title, rows, total }: { title: string; rows: [T, number][]; total: number }) {
  if (!rows.length) return null;
  return (
    <div className="ds-block">
      <b>{title}</b>
      {rows.map(([k, n]) => (
        <div key={String(k)} className="ds-row">
          <span className="ds-label">{k}</span>
          <span className="ds-bar"><span style={{ width: `${Math.round((n / Math.max(1, total)) * 100)}%` }} /></span>
          <span className="ds-n">{n}</span>
        </div>
      ))}
    </div>
  );
}

/** Main Deck breakdown: card kinds, monster Attributes and Levels. */
export function DeckStats({ main, cardOf }: { main: number[]; cardOf: (id: number) => Card }) {
  const cards = main.map(cardOf);
  const monsters = cards.filter((c) => c.category === "Monster");
  const kinds = tally(cards, (c) => (c.category === "Monster" ? `${c.kind ?? "Monster"} monster` : c.category === "Unknown" ? "Unknown" : `${c.kind ?? ""} ${c.category}`.trim()));
  const attrs = tally(monsters, (c) => c.attribute);
  const levels = tally(monsters, (c) => (c.level ?? c.linkval ?? null)).sort((a, b) => Number(a[0]) - Number(b[0])).map(([l, n]) => [`Lv ${l}`, n] as [string, number]);
  return (
    <details className="ds">
      <summary>Main Deck stats</summary>
      <div className="ds-grid">
        <Bars title="Card kinds" rows={kinds} total={cards.length} />
        <Bars title="Attributes" rows={attrs} total={monsters.length} />
        <Bars title="Levels" rows={levels} total={monsters.length} />
      </div>
    </details>
  );
}
