// Card text, formatted for fast reading: each effect on its own line; the activation condition
// ("If ... :") in italics, the cost / target part (before ";") tinted, the "once per turn" limits set
// apart, and the key verbs (Summon, destroy, banish, negate, add to hand, target...) colour-coded.
import type { ReactNode } from "react";
import "./CardText.css";

/** Split on `sep` outside "quoted names". Returns [before, after] or null. */
function splitOnce(s: string, sep: string): [string, string] | null {
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') q = !q;
    else if (!q && ch === sep) return [s.slice(0, i + 1), s.slice(i + 1)];
  }
  return null;
}

/** Sentences of one line (". " outside quotes ends one). */
function sentences(line: string): string[] {
  const out: string[] = [];
  let q = false, start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (!q && ch === "." && (i === line.length - 1 || line[i + 1] === " ")) {
      out.push(line.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  const rest = line.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

// key words, in priority order (first match wins at a position)
const RULES: [RegExp, string][] = [
  [/\(Quick Effect\)/y, "ct-quick"],
  [/\b(?:[Oo]nce per turn|twice per turn|once per Duel|per turn)\b/y, "ct-limitword"],
  [/\b(?:Special|Normal|Tribute|Fusion|Synchro|Xyz|Link|Ritual|Pendulum|Flip) Summon(?:ed|s|ing)?\b/y, "ct-summon"],
  [/\bSummon(?:ed|s|ing)?\b/y, "ct-summon"],
  [/\b(?:negate[sd]?|negating)\b/y, "ct-negate"],
  [/\b(?:destroy(?:ed|s|ing)?)\b/y, "ct-destroy"],
  [/\b(?:banish(?:ed|es|ing)?)\b/y, "ct-banish"],
  [/\b(?:add(?:s|ed)?)\b(?= [^.;]*\bto (?:your|its owner's|their|the owner's) hand)/y, "ct-search"],
  [/\bto (?:your|its owner's|their|the owner's) hand\b/y, "ct-search"],
  [/\b(?:send|sends|sent)\b/y, "ct-send"],
  [/\b(?:target(?:s|ed|ing)?)\b/y, "ct-target"],
  [/\b(?:cannot|can't|unaffected)\b/y, "ct-cannot"],
  [/\b(?:draw|draws)\b/y, "ct-draw"],
  [/\b(?:Extra Deck|GY|Deck|banishment)\b/y, "ct-place"],
  [/\b\d{3,5}\b(?= (?:ATK|DEF|LP|damage))/y, "ct-num"],
  [/\b(?:ATK|DEF)\b/y, "ct-stat"],
];

/** Words and "names" of one stretch of text. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let plain = "", k = 0;
  const flush = () => { if (plain) { out.push(plain); plain = ""; } };
  for (let i = 0; i < text.length;) {
    if (text[i] === '"') {
      // a card / archetype name: up to the closing quote (names like "JJ "Kewl Tune"" end at '" ' / '".' ...)
      let j = text.indexOf('"', i + 1);
      while (j > 0 && j + 1 < text.length && text[j + 1] === '"') j++;
      if (j > i) {
        flush();
        out.push(<span key={`${keyBase}-${k++}`} className="ct-name">{text.slice(i, j + 1)}</span>);
        i = j + 1;
        continue;
      }
    }
    // only start a match on a word boundary
    const prev = i === 0 ? " " : text[i - 1];
    let hit: [string, string] | null = null;
    if (!/[A-Za-z0-9]/.test(prev) || text[i] === "(") {
      for (const [re, cls] of RULES) {
        re.lastIndex = i;
        const m = re.exec(text);
        if (m) { hit = [m[0], cls]; break; }
      }
    }
    if (hit) {
      flush();
      out.push(<span key={`${keyBase}-${k++}`} className={hit[1]}>{hit[0]}</span>);
      i += hit[0].length;
    } else {
      plain += text[i++];
    }
  }
  flush();
  return out;
}

const isLimit = (s: string) => /^(?:You can only (?:use|activate|Special Summon|control)|You can only use each|You cannot )/.test(s) || /^\(This card is always treated/.test(s);
const isMaterials = (line: string, i: number) => i === 0 && !/[.:;]$/.test(line.trim()) && /\+|\bmonsters?\b|\bTuners?\b/.test(line) && line.length < 140;

/** One effect sentence: condition (before ":") / cost-target (before ";") / effect. */
function Effect({ s, k }: { s: string; k: string }) {
  if (isLimit(s)) return <span className="ct-sentence ct-limit">{inline(s, k)}</span>;
  const c = splitOnce(s, ":");
  const cond = c && c[0].length < 200 ? c[0] : null;
  const rest = cond ? c![1] : s;
  const cost = splitOnce(rest, ";");
  return (
    <span className={`ct-sentence ${cond || cost ? "is-effect" : ""}`}>
      {cond && <span className="ct-cond">{inline(cond, `${k}c`)}</span>}
      {cost ? <><span className="ct-cost">{inline(cost[0], `${k}o`)}</span>{inline(cost[1], `${k}e`)}</> : inline(rest, `${k}r`)}
    </span>
  );
}

export function CardText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className={`card-text ${className}`}>
      {lines.map((line, li) => {
        if (isMaterials(line, li)) return <p key={li} className="ct-materials">{inline(line, `m${li}`)}</p>;
        // Pendulum text blocks and section headers keep their own line
        if (/^\[ ?(Pendulum Effect|Monster Effect|Flavor Text) ?\]$/i.test(line) || /^-+$/.test(line)) return <p key={li} className="ct-header">{line.replace(/[[\]-]/g, "").trim()}</p>;
        const bullet = /^[●•]/.test(line);
        return (
          <p key={li} className={bullet ? "ct-bullet" : ""}>
            {sentences(bullet ? line.replace(/^[●•]\s*/, "") : line).map((s, si) => <Effect key={si} s={s} k={`${li}-${si}`} />)}
          </p>
        );
      })}
    </div>
  );
}
