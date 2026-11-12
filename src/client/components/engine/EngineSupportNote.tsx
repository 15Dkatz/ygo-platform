import { useEffect, useState } from "react";
import { api, lookupCards } from "../../api.ts";

interface Unsupported { id: number; reason: string; skill: boolean; name: string }

const SKILL_REASON = /^Skill card/;

/** Set when the server's card-script table is nearly empty (a setup problem: most cards act blank). */
let scriptsMissing: { have: number } | null = null;

/** Which cards of a deck the rules engine can't play, by name (null while loading / on error).
 *  `skill` cards are banned outright in rules-enforced duels; the rest just lose their effects. */
export function useEngineSupport(ids: number[] | null): Unsupported[] | null {
  const key = ids ? [...new Set(ids)].sort((a, b) => a - b).join(",") : "";
  const [list, setList] = useState<Unsupported[] | null>(null);
  useEffect(() => {
    let alive = true;
    const unique = key ? key.split(",").map(Number) : [];
    if (!unique.length) { setList(null); return; }
    (async () => {
      try {
        const r = await api<{ unsupported: { id: number; reason: string }[]; scriptsMissing?: { have: number } }>("/api/engine/support", { method: "POST", json: { ids: unique } });
        scriptsMissing = r.scriptsMissing ?? null;
        const names = r.unsupported.length ? await lookupCards(r.unsupported.map((u) => u.id)) : null;
        const byId = new Map(names?.cards.map((c) => [c.id, c.name]) ?? []);
        const alias = names?.alias ?? {};
        if (alive) setList(r.unsupported.map((u) => ({ ...u, skill: SKILL_REASON.test(u.reason), name: byId.get(alias[u.id] ?? u.id) ?? `Card ${u.id}` })));
      } catch {
        if (alive) setList(null);
      }
    })();
    return () => { alive = false; };
  }, [key]);
  return list;
}

/** The Skill cards in a support list (they block rules-enforced duels). */
export const skillCards = (list: Unsupported[] | null) => (list ?? []).filter((u) => u.skill);

/** Warns which cards of a deck the rules engine can't play: Skill cards (not allowed at all) first,
 *  then cards it can't script yet (they'd have no effects). */
export function EngineSupportNote({ ids, label = "this deck" }: { ids: number[]; label?: string }) {
  const list = useEngineSupport(ids);
  if (!list) return null;
  if (scriptsMissing) {
    return (
      <div className="engine-support is-error" role="alert">
        <b>The rules engine's card scripts aren't loaded</b> (only {scriptsMissing.have} found), so most cards will have no effects.
        <span> Server setup: run <code>npm run engine:import:local</code> (or <code>:remote</code>).</span>
      </div>
    );
  }
  if (!list.length) return <small className="engine-support is-ok">Every card in {label} is supported by the rules engine.</small>;
  const skills = list.filter((u) => u.skill), rest = list.filter((u) => !u.skill);
  return (
    <>
      {skills.length > 0 && (
        <div className="engine-support is-error" role="alert">
          <b>{label[0].toUpperCase() + label.slice(1)} has {skills.length === 1 ? "a Skill card" : `${skills.length} Skill cards`}, which aren't allowed in rules-enforced duels</b>
          <span> (regular Yu-Gi-Oh! only). Remove {skills.length === 1 ? "it" : "them"}, pick another deck, or play a manual duel:</span>
          <ul>{skills.slice(0, 8).map((u) => <li key={u.id}>{u.name}</li>)}</ul>
        </div>
      )}
      {rest.length > 0 && (
        <div className="engine-support is-warn" role="note">
          <b>{rest.length} card{rest.length === 1 ? "" : "s"} in {label} can't be played with full rules yet</b>
          <span> — in a rules-enforced duel {rest.length === 1 ? "it has" : "they have"} no effects:</span>
          <ul>
            {rest.slice(0, 12).map((u) => <li key={u.id}>{u.name} <span className="muted">({u.reason})</span></li>)}
            {rest.length > 12 && <li className="muted">…and {rest.length - 12} more</li>}
          </ul>
        </div>
      )}
    </>
  );
}
