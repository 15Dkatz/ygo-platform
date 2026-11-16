// A duelist's profile, shown to everyone in the room: an avatar (a card's art), a short title and a
// showcase card. Kept in the player's browser and sent when they take a seat (like their sleeve).
export interface Profile {
  /** card id whose art is the avatar */
  avatar?: number;
  /** a few words under the name ("Kewl Tune enjoyer") */
  title?: string;
  /** a card to show off */
  showcase?: number;
}

const code = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 100 && v < 1e10 ? v : undefined);

/** A valid profile (anything else dropped); undefined when empty. */
export function cleanProfile(raw: unknown): Profile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) : "";
  const p: Profile = { avatar: code(r.avatar), showcase: code(r.showcase), ...(title ? { title } : {}) };
  if (!p.avatar) delete p.avatar;
  if (!p.showcase) delete p.showcase;
  return Object.keys(p).length ? p : undefined;
}
