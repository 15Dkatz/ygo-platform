// Attack outcome preview: what happens if `attacker` attacks `target`, from the cards' current stats.
// (Effects that trigger during battle aren't known in advance; this is the plain battle result.)
export interface Fighter { atk: number; def: number; position?: string; faceUp: boolean; link?: boolean }
export interface Outcome { text: string; tone: "good" | "bad" | "even" | "unknown" }

export function attackOutcome(attacker: Fighter, target: Fighter): Outcome {
  if (!target.faceUp) return { text: "Face-down: DEF unknown", tone: "unknown" };
  const a = attacker.atk;
  if (target.position === "def") {
    const d = target.def;
    if (a > d) return { text: "Destroys it · no damage", tone: "good" };
    if (a === d) return { text: "Neither destroyed", tone: "even" };
    return { text: `Bounces off · you take ${d - a}`, tone: "bad" };
  }
  const t = target.atk;
  if (a > t) return { text: `Destroys it · ${a - t} damage`, tone: "good" };
  if (a === t) return { text: "Both destroyed", tone: "even" };
  return { text: `Yours is destroyed · you take ${t - a}`, tone: "bad" };
}
