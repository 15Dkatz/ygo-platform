import type { Section } from "./types.ts";

const SECTION_MARKERS: Record<string, Section> = {
  "#main": "main",
  "#extra": "extra",
  "!side": "side",
  "#side": "side",
};

export interface ParsedYdk {
  main: number[];
  extra: number[];
  side: number[];
  ignored: string[];   // lines that could not be understood
}

/** Parse a .ydk deck file (same rules as the Python script's parse_ydk). */
export function parseYdk(text: string): ParsedYdk {
  const out: ParsedYdk = { main: [], extra: [], side: [], ignored: [] };
  let section: Section = "main";
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const marker = SECTION_MARKERS[line.toLowerCase()];
    if (marker) section = marker;
    else if (line.startsWith("#") || line.startsWith("!")) continue; // comment, e.g. "#created by ..."
    else if (/^\d+$/.test(line)) out[section].push(Number(line));
    else out.ignored.push(line);
  }
  return out;
}

/** Serialise a deck back to .ydk text (EDOPro / YGOPro / YGOPRODeck compatible). */
export function toYdk(deck: { main: number[]; extra: number[]; side: number[] }): string {
  return [
    "#created by ygo-platform",
    "#main",
    ...deck.main.map(String),
    "#extra",
    ...deck.extra.map(String),
    "!side",
    ...deck.side.map(String),
    "",
  ].join("\n");
}
