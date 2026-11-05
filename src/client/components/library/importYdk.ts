import type { Deck } from "../../../shared/types.ts";
import { parseYdk } from "../../../shared/ydk.ts";
import { localDate } from "../../../shared/library.ts";
import { newDeck } from "../../store/deckStore.ts";
import { catalog, ensureCards } from "../cards/catalog.ts";

export interface ImportSummary {
  files: number;          // .ydk files read
  decks: number;          // decks saved
  added: number;          // new deck names
  replaced: number;       // existing decks replaced (same name)
  duplicateNames: number; // files in this import sharing a name (last one wins)
  slots: number;          // card slots read
  uniqueCards: number;    // distinct catalogue cards identified
  unknownIds: number[];   // distinct raw ids the catalogue doesn't know
  unknownSlots: number;
  ignoredLines: number;
  skipped: number;        // non-.ydk files in the selection
}

export type ImportProgress = { phase: "reading" | "looking up" | "saving"; done: number; total: number };

const isYdk = (f: File) => f.name.toLowerCase().endsWith(".ydk");
/** Deck name = file name without extension (accounts API allows at most 100 characters). */
const stem = (name: string) => name.replace(/\.[^.]*$/, "").slice(0, 100);

/**
 * Turn .ydk files into decks: name = file name without extension, file_modified from
 * File.lastModified (local YYYY-MM-DD), ids resolved to canonical catalogue ids (unknown raw
 * ids are kept). A deck with the same name as an existing one replaces it (same id).
 */
export async function importYdkFiles(
  files: File[],
  existing: Deck[],
  onProgress: (p: ImportProgress) => void,
): Promise<{ decks: Deck[]; summary: ImportSummary }> {
  const ydks = files.filter(isYdk).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
  const parsed: { name: string; modified: string; main: number[]; extra: number[]; side: number[] }[] = [];
  let ignoredLines = 0;
  for (let i = 0; i < ydks.length; i++) {
    const f = ydks[i];
    const p = parseYdk(await f.text());
    ignoredLines += p.ignored.length;
    parsed.push({ name: stem(f.name), modified: localDate(f.lastModified), main: p.main, extra: p.extra, side: p.side });
    if (i % 20 === 0) onProgress({ phase: "reading", done: i + 1, total: ydks.length });
  }
  const allIds = parsed.flatMap((d) => [...d.main, ...d.extra, ...d.side]);
  await ensureCards(allIds, (done, total) => onProgress({ phase: "looking up", done, total }));

  const byName = new Map(existing.map((d) => [d.name, d]));
  const out = new Map<string, Deck>();
  let duplicateNames = 0, replaced = 0, slots = 0, unknownSlots = 0;
  const unknown = new Set<number>(), known = new Set<number>();
  const resolve = (ids: number[]) =>
    ids.map((raw) => {
      slots++;
      const id = catalog.resolve(raw);
      if (catalog.cards.has(id)) known.add(id);
      else { unknown.add(raw); unknownSlots++; }
      return id;
    });
  const now = new Date().toISOString();
  for (const p of parsed) {
    if (out.has(p.name)) duplicateNames++;
    const prev = byName.get(p.name);
    const deck: Deck = prev
      ? { ...prev, main: [], extra: [], side: [], updated_at: now }
      : newDeck(p.name);
    deck.main = resolve(p.main);
    deck.extra = resolve(p.extra);
    deck.side = resolve(p.side);
    deck.file_modified = p.modified;
    deck.file_created = null;
    out.set(p.name, deck);
  }
  for (const name of out.keys()) if (byName.has(name)) replaced++;
  return {
    decks: [...out.values()],
    summary: {
      files: ydks.length, decks: out.size, added: out.size - replaced, replaced, duplicateNames, slots,
      uniqueCards: known.size, unknownIds: [...unknown].sort((a, b) => a - b), unknownSlots, ignoredLines,
      skipped: files.length - ydks.length,
    },
  };
}

/** One-line summary of an import, for notices. */
export function summaryText(s: ImportSummary): string {
  return `Imported ${s.decks} deck(s) (${s.added} new, ${s.replaced} replaced): ${s.slots.toLocaleString()} card slots, ` +
    `${s.uniqueCards.toLocaleString()} unique cards identified` +
    (s.unknownIds.length ? `, ${s.unknownIds.length} unrecognised ID(s) covering ${s.unknownSlots} slot(s) kept as "Unknown card" entries.` : ".");
}
