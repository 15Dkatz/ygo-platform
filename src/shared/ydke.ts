// YDKe: the one-line deck format used by EDOPro, YGOPRODeck, Discord bots, etc.
//   ydke://<main>!<extra>!<side>!
// where each part is base64 of the card passcodes as little-endian uint32s.

export interface DeckLists { main: number[]; extra: number[]; side: number[] }

function encodePart(ids: number[]): string {
  const bytes = new Uint8Array(ids.length * 4);
  const view = new DataView(bytes.buffer);
  ids.forEach((id, i) => view.setUint32(i * 4, id >>> 0, true));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodePart(b64: string): number[] {
  const bin = atob(b64);
  if (bin.length % 4) throw new Error("not a YDKe deck (bad section length)");
  const out: number[] = [];
  for (let i = 0; i < bin.length; i += 4) {
    out.push((bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8) | (bin.charCodeAt(i + 2) << 16) | (bin.charCodeAt(i + 3) << 24)) >>> 0);
  }
  return out;
}

export function toYdke(deck: DeckLists): string {
  return `ydke://${encodePart(deck.main)}!${encodePart(deck.extra)}!${encodePart(deck.side)}!`;
}

/** Parse a ydke:// link (surrounding whitespace allowed). Throws with a readable message. */
export function parseYdke(text: string): DeckLists {
  const s = text.trim();
  if (!s.toLowerCase().startsWith("ydke://")) throw new Error("A YDKe link starts with ydke://");
  const parts = s.slice(7).split("!");
  if (parts.length < 3) throw new Error("not a YDKe deck (expected main!extra!side!)");
  try {
    return { main: decodePart(parts[0]), extra: decodePart(parts[1]), side: decodePart(parts[2]) };
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith("not a") ? e.message : "not a YDKe deck (invalid base64)");
  }
}
