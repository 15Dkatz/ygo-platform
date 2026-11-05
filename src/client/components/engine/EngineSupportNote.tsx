import { useEffect, useState } from "react";
import { api, lookupCards } from "../../api.ts";

interface Unsupported { id: number; reason: string }

/** Warns which cards of a deck the rules engine can't play (they'd have no effects). */
export function EngineSupportNote({ ids }: { ids: number[] }) {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(",");
  const [list, setList] = useState<(Unsupported & { name: string })[] | null>(null);

  useEffect(() => {
    let alive = true;
    const unique = key ? key.split(",").map(Number) : [];
    if (!unique.length) { setList(null); return; }
    (async () => {
      try {
        const r = await api<{ unsupported: Unsupported[] }>("/api/engine/support", { method: "POST", json: { ids: unique } });
        const names = r.unsupported.length ? await lookupCards(r.unsupported.map((u) => u.id)) : null;
        const byId = new Map(names?.cards.map((c) => [c.id, c.name]) ?? []);
        const alias = names?.alias ?? {};
        if (alive) setList(r.unsupported.map((u) => ({ ...u, name: byId.get(alias[u.id] ?? u.id) ?? `Card ${u.id}` })));
      } catch {
        if (alive) setList(null);
      }
    })();
    return () => { alive = false; };
  }, [key]);

  if (!list) return null;
  if (!list.length) return <small className="engine-support is-ok">Every card in this deck is supported by the rules engine.</small>;
  return (
    <div className="engine-support is-warn" role="note">
      <b>{list.length} card{list.length === 1 ? "" : "s"} in this deck can't be played with full rules yet</b>
      <span> — in a rules-enforced duel {list.length === 1 ? "it has" : "they have"} no effects:</span>
      <ul>
        {list.slice(0, 12).map((u) => <li key={u.id}>{u.name} <span className="muted">({u.reason})</span></li>)}
        {list.length > 12 && <li className="muted">…and {list.length - 12} more</li>}
      </ul>
    </div>
  );
}
