/** Refresh the bundled official TCG Genesys point list. Review the diff before committing. */
import { writeFileSync } from "node:fs";
const source = "https://www.yugioh-card.com/en/genesys/";
const res = await fetch(source);
if (!res.ok) throw new Error(`Official list returned ${res.status}`);
const html = await res.text();
const decode = (s: string) => s.replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n)))
  .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const points: Record<string, number> = {};
for (const match of html.matchAll(/<td class="column-1">(.*?)<\/td><td class="column-2">\s*(\d+)\s*<\/td>/gs)) {
  const name = decode(match[1].replace(/<[^>]+>/g, "")).trim();
  if (name.includes("&" ) && /&\w+;/.test(name)) throw new Error(`Unhandled HTML entity: ${name}`);
  points[name] = Number(match[2]);
}
if (Object.keys(points).length < 500) throw new Error("Official table changed or is incomplete; refusing to replace list.");
const date = new Date().toISOString().slice(0, 10);
writeFileSync("src/shared/genesysPoints.ts", `// Official TCG Genesys list, checked ${date}. Refresh with npm run genesys:update.\nexport const GENESYS_SOURCE = ${JSON.stringify(source)};\nexport const GENESYS_CHECKED = ${JSON.stringify(date)};\nexport const GENESYS_POINTS: Readonly<Record<string, number>> = ${JSON.stringify(points, null, 2)};\n`);
console.log(`Saved ${Object.keys(points).length} official pointed cards (${date}).`);
