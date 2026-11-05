import type { Card } from "../../../shared/types.ts";

/** "Lv4" / "Rank 4" / "Link-2" (or null). */
export function levelLabel(c: Card): string | null {
  if (c.linkval) return `Link-${c.linkval}`;
  if (c.level === null || c.level === undefined) return null;
  return (c.type || "").includes("XYZ") ? `Rank ${c.level}` : `Lv${c.level}`;
}

/** "Effect · DARK · Lv4" */
export function kindLine(c: Card): string {
  return [c.kind, c.attribute, levelLabel(c)].filter(Boolean).join(" · ");
}

/** "ATK 2500 / DEF 2100" (Link monsters have no DEF). */
export function statLine(c: Card): string {
  if (c.category !== "Monster") return "";
  const atk = c.atk === null ? "?" : String(c.atk);
  if (c.linkval) return `ATK ${atk}`;
  const def = c.defense === null ? "?" : String(c.defense);
  return `ATK ${atk} / DEF ${def}`;
}

/** Full type line: "Dragon / Effect Monster · LIGHT". */
export function typeLine(c: Card): string {
  return [c.type, c.race && c.category === "Monster" ? c.race : null, c.attribute].filter(Boolean).join(" · ");
}

/** TCG banlist copy limit: Forbidden 0, Limited 1, Semi-Limited 2, otherwise 3. */
export function banLimit(ban: string | null | undefined): number {
  const b = (ban || "").toLowerCase();
  if (b === "banned" || b === "forbidden") return 0;
  if (b === "limited") return 1;
  if (b === "semi-limited") return 2;
  return 3;
}

/** CSS class suffix for a card frame colour. */
export function categoryClass(c: Pick<Card, "category">): string {
  return c.category === "Spell" ? "spell" : c.category === "Trap" ? "trap" : c.category === "Monster" ? "monster" : "unknown";
}

/** Trigger a file download in the browser. */
export function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-name-safe version of a deck name. */
export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "deck";
