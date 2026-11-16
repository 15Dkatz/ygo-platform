import { useEffect, useMemo, useState, type ReactNode } from "react";
import { avatarStyle, getProfile } from "./profileStore.ts";
import "./profile.css";
import { Link } from "react-router-dom";
import type { ClientMsg, RpsChoice, SessionInfo, SeatInfo } from "../../../shared/duel.ts";
import type { Seat } from "../../../shared/duelActions.ts";
import type { Card, Deck } from "../../../shared/types.ts";
import { DEFAULT_SETTINGS, formatTimeControl } from "../../../shared/roomSettings.ts";
import { sleeveLabel } from "../../../shared/sleeves.ts";
import { isStarterDeck } from "../../../shared/starterDecks.ts";
import { unknownCard } from "../../../shared/library.ts";
import { cardImage } from "../../api.ts";
import { catalog, ensureCards } from "../cards/catalog.ts";
import { SleevePicker } from "../cards/SleevePicker.tsx";
import { TestHand } from "../library/TestHand.tsx";
import "../library/deck-tools.css";
import { DeckSelect } from "./DeckPicker.tsx";
import { SoundThemePicker } from "./SoundThemePicker.tsx";
import { RoomRules } from "./RoomRules.tsx";
import { SleeveBack } from "./Sleeve.tsx";
import { RESOLVE_COLORS, RESOLVE_COLOR_LABEL, RESOLVE_FX, RESOLVE_FX_LABEL, SPLASH_STYLES, SPLASH_STYLE_LABEL, SUMMON_FX, SUMMON_FX_LABEL, TILT_MAX, setDuelSetting, useDuelSettings, type ResolveColor, type ResolveFx, type SplashStyle, type SummonFxMode } from "./duelSettings.ts";
import { EngineSupportNote, skillCards, useEngineSupport } from "../engine/EngineSupportNote.tsx";
import "../engine/EngineSupportNote.css";
import "./preduel.css";

const RPS: { choice: RpsChoice; label: string; glyph: string }[] = [
  { choice: "rock", label: "Rock", glyph: "✊" },
  { choice: "paper", label: "Paper", glyph: "✋" },
  { choice: "scissors", label: "Scissors", glyph: "✌" },
];

interface Props {
  session: SessionInfo;
  you: Seat | null;
  hasIdentity: boolean;
  decks: Deck[] | null;
  deckId: string;
  setDeckId(id: string): void;
  deck: Deck | null;
  /** change a deck's sleeve (saved with your own decks, remembered for starter decks) */
  setSleeve?(deckId: string, sleeve: string): void | Promise<void>;
  /** open the deck builder for a deck (a modal on the duel page) */
  onEditDeck?(deckId: string): void;
  /** "end": inside the end-of-duel screen, which shows the result and Rematch itself */
  variant?: "end";
  send(m: ClientMsg): void;
}

/** The deck you're seated with (so a sleeve change goes to the room only when it's that deck). Kept across
 *  remounts of this component (lobby -> duel -> finished). */
let seatedDeckId: string | null = null;

const cardOf = (id: number): Card => catalog.get(id) ?? unknownCard(id);

/** Seats, deck + sleeve, room rules, your duel view, rock-paper-scissors, turn order, rematch.
 *  Shown whenever the board is not live (and over the board when a duel has finished). */
export function PreDuel({ session, you, hasIdentity, decks, deckId, setDeckId, deck, setSleeve, onEditDeck, variant, send }: Props) {
  const { stage, seats } = session;
  const seated = you !== null;
  const freeSeat = seats.some((s) => s === null);
  const sendDeck = () => {
    if (!deck) return;
    seatedDeckId = deck.id;
    send({ t: "join", deckId: deck.id, main: deck.main, extra: deck.extra, side: deck.side, rarity: deck.rarity, sleeve: deck.sleeve, profile: getProfile() });
  };
  const opp = you === null ? null : seats[you === 0 ? 1 : 0];
  const between = stage === "lobby" || stage === "finished";
  // bot opponent (rules-enforced rooms): only the host (seat 0) can seat or remove it
  const [botDeckId, setBotDeckId] = useState("");
  const botDeck = decks?.find((d) => d.id === (botDeckId || deckId)) ?? null;
  const canBot = session.mode === "engine" && you === 0 && between;
  const hasBot = !!seats[1]?.bot;
  const engine = session.mode === "engine";
  const mySkills = skillCards(useEngineSupport(engine ? (deck ? [...deck.main, ...deck.extra, ...deck.side] : null) : null));
  const botSkills = skillCards(useEngineSupport(engine ? (botDeck ? [...botDeck.main, ...botDeck.extra, ...botDeck.side] : null) : null));
  const settings = session.settings ?? DEFAULT_SETTINGS;
  const isHost = you === 0 && !seats[0]?.bot;
  const [picking, setPicking] = useState(false);
  const [testHand, setTestHand] = useState(false);

  const pickSleeve = (s: string) => {
    if (!deck) return;
    void setSleeve?.(deck.id, s);
    if (seated && seats[you!]?.ready && seatedDeckId === deck.id) send({ t: "sleeve", sleeve: s });
  };

  const showSetup = between && hasIdentity && (seated || freeSeat);
  const deckPanel = <section className="pd-panel pd-deck">
            <h3>Your deck</h3>
            <div className="duel-deckrow">
              <DeckSelect decks={decks} deckId={deckId} onChange={setDeckId} />
              <button className="primary" disabled={!deck || mySkills.length > 0} onClick={sendDeck}>
                {!seated ? "Take a seat with this deck" : stage === "finished" ? "Use this deck (side deck)" : seats[you!]?.ready ? "Change deck" : "Ready with this deck"}
              </button>
            </div>
            {session.mode === "engine" && deck && <EngineSupportNote ids={[...deck.main, ...deck.extra, ...deck.side]} />}
            {deck && <DeckSummary deck={deck} />}
            {deck && (
              <div className="duel-deckrow">
                <button type="button" disabled={deck.main.length < 5} onClick={() => setTestHand(true)} title="Draw a random opening hand">Test hand</button>
                {onEditDeck
                  ? <button type="button" onClick={() => onEditDeck(deck.id)}>{isStarterDeck(deck.id) ? "Copy and edit…" : "Edit deck…"}</button>
                  : isStarterDeck(deck.id)
                    ? <Link className="pd-link" to="/decks">Copy it to edit →</Link>
                    : <Link className="pd-link" to={`/decks/${deck.id}`}>Edit in the deck builder →</Link>}
              </div>
            )}
          </section>;
  const sleevePanel = deck ? <section className="pd-panel pd-sleeve">
            <h3>Sleeve</h3>
            <button type="button" className="pd-sleeve-fan" onClick={() => setPicking(true)} title="Change sleeve" aria-label="Change sleeve">
              <span><SleeveBack sleeve={deck.sleeve} /></span>
              <span><SleeveBack sleeve={deck.sleeve} /></span>
              <span><SleeveBack sleeve={deck.sleeve} /></span>
            </button>
            <b className="pd-sleeve-name">{sleeveLabel(deck.sleeve, (id) => cardOf(id).name)}</b>
            <QuickSleeves deck={deck} onPick={pickSleeve} />
            <button type="button" onClick={() => setPicking(true)}>All sleeves…</button>
            <small className="muted">{isStarterDeck(deck.id) ? "Remembered for this starter deck in this browser." : "Saved with this deck."} Both players see it.</small>
          </section> : null;
  const rulesPanel = <section className="pd-panel pd-rules">
            <h3>Room rules {!isHost && <small className="muted">· set by {seats[0]?.bot ? "the host" : seats[0]?.name ?? "the host"}</small>}</h3>
            <RoomRules value={settings} readOnly={!isHost} onChange={(next) => send({ t: "settings", settings: next })} />
            {isHost && <small className="muted">Changes are announced in the chat.</small>}
            {seated && !opp && stage === "lobby" && <InviteLink />}
          </section>;
  const panels = (
      <div className="pd-grid">
        {showSetup && deckPanel}
        {showSetup && sleevePanel}
        {(between || stage === "rps" || stage === "choose") && rulesPanel}
        {seated && between && <ViewPanel />}
      </div>
  );
  // the end-of-duel screen: the same panels as tabs (one at a time, so nothing needs scrolling)
  const endTabs: EndTab[] = [
    ...(showSetup ? [{ id: "deck", label: "Deck", node: deckPanel }] : []),
    ...(showSetup && sleevePanel ? [{ id: "sleeve", label: "Sleeve", node: sleevePanel }] : []),
    { id: "rules", label: "Rules", node: rulesPanel },
    ...(seated ? [{ id: "view", label: "View", node: <ViewPanel /> }] : []),
  ];

  return (
    <div className={`duel-preduel pd ${stage === "finished" ? "is-finished" : ""}`}>
      {picking && deck && (
        <SleevePicker value={deck.sleeve} deckCards={[...deck.main, ...deck.extra]} cardName={(id) => cardOf(id).name}
          onPick={pickSleeve} onClose={() => setPicking(false)} />
      )}
      {testHand && deck && <TestHand main={deck.main} cardOf={cardOf} onClose={() => setTestHand(false)} />}

      {/* ---------- versus ---------- */}
      {variant !== "end" && <div className="pd-versus">
        <SeatCard seat={seats[0]} index={0} you={you} />
        <div className="pd-vs">
          <b>VS</b>
          <span className="pd-chip" title="Time control">⏱ {formatTimeControl(settings)}</span>
          <span className="pd-chip" title="Starting Life Points">♥ {settings.startingLP.toLocaleString()} LP</span>
          <span className="pd-chip">{engine ? "Rules-enforced" : "Manual"}</span>
        </div>
        <SeatCard seat={seats[1]} index={1} you={you} />
      </div>}

      {session.engineNotice && (
        <div className="duel-notice">
          <b>Rules-enforced (beta)</b>
          <p>{session.engineNotice}</p>
          {seated && (
            <button className="primary" disabled={session.switchVotes?.[you!]} onClick={() => send({ t: "switchMode", mode: "manual" })}>
              {session.switchVotes?.[you!] ? "Waiting for your opponent…" : "Play this room manually"}
            </button>
          )}
        </div>
      )}

      {/* ---------- what happens now ---------- */}
      {stage === "finished" && variant !== "end" && (
        <div className="duel-result">
          <h2>{session.winner === null ? "Draw" : session.winner === you ? "You win!" : you === null ? `${seats[session.winner]?.name ?? "Player"} wins` : "You lose"}</h2>
          {session.endReason && <p className="muted">{session.endReason}</p>}
          {seated && (
            <div className="duel-deckrow">
              <button className="primary" disabled={session.rematch[you!] || !opp} onClick={() => send({ t: "rematch" })}>
                {session.rematch[you!] ? "Waiting for opponent…" : "Rematch"}
              </button>
              {opp && session.rematch[you === 0 ? 1 : 0] && <span className="muted">{opp.name} wants a rematch.</span>}
            </div>
          )}
        </div>
      )}

      {stage === "rps" && (
        <div className="duel-step pd-step">
          <h2>Rock, paper, scissors</h2>
          {session.rps.last && session.rps.last.winner === null && <p className="muted">Tie ({session.rps.last.choices[0]}) — go again!</p>}
          {seated ? (
            <>
              <div className="duel-rps">
                {RPS.map((r) => (
                  <button key={r.choice} className={session.rps.mine === r.choice ? "is-picked" : ""} disabled={!!session.rps.mine} onClick={() => send({ t: "rps", choice: r.choice })} aria-label={r.label}>
                    <span className="duel-rps-glyph" aria-hidden>{r.glyph}</span>{r.label}
                  </button>
                ))}
              </div>
              <p className="muted">
                {session.rps.mine ? (session.rps.opponentPicked ? "Revealing…" : "Waiting for your opponent…") : session.rps.opponentPicked ? "Your opponent has picked." : "The winner chooses who goes first."}
              </p>
              <button onClick={() => send({ t: "coinToss" })}>Toss a coin instead</button>
            </>
          ) : <p className="muted">The players are deciding who goes first.</p>}
        </div>
      )}

      {stage === "choose" && (
        <div className="duel-step pd-step">
          {session.rps.last?.winner != null && <p className="muted">{seats[0]?.name} picked {session.rps.last.choices[0]}, {seats[1]?.name} picked {session.rps.last.choices[1]}.</p>}
          {you !== null && session.chooser === you ? (
            <>
              <h2>Go first or second?</h2>
              <div className="duel-deckrow">
                <button className="primary" onClick={() => send({ t: "chooseOrder", first: true })}>Go first</button>
                <button onClick={() => send({ t: "chooseOrder", first: false })}>Go second</button>
              </div>
            </>
          ) : <p>{session.chooser !== null ? `${seats[session.chooser]?.name} is choosing who goes first…` : "…"}</p>}
        </div>
      )}

      {between && !hasIdentity && <p className="muted">Pick a display name in the lobby to take a seat. You are spectating.</p>}
      {between && hasIdentity && !seated && !freeSeat && <p className="muted">Both seats are taken — you are spectating.</p>}

      {/* ---------- setup panels (after a duel: folded away under the result) ---------- */}
      {variant === "end" ? <EndTabsView tabs={endTabs} /> : stage === "finished" ? (
        <details className="pd-more">
          <summary>Side deck, sleeve, rules and view</summary>
          {panels}
        </details>
      ) : panels}
      {variant !== "end" && canBot && !seats[1] && seats[0]?.ready && (
        <div className="duel-bot">
          <b>No opponent yet?</b> <span className="muted">Play against a bot (it plays random legal moves). Its deck:</span>
          <div className="duel-deckrow">
            <DeckSelect decks={decks} deckId={botDeckId || deckId} onChange={setBotDeckId} />
            <button disabled={!botDeck || botSkills.length > 0} onClick={() => botDeck && send({ t: "addBot", deckId: botDeck.id, main: botDeck.main, extra: botDeck.extra, side: botDeck.side, rarity: botDeck.rarity, sleeve: botDeck.sleeve })}>
              Play against a bot
            </button>
            {botDeck && botSkills.length > 0 && <EngineSupportNote ids={[...botDeck.main, ...botDeck.extra, ...botDeck.side]} label="the bot's deck" />}
          </div>
        </div>
      )}
      {canBot && hasBot && stage === "lobby" && (
        <div className="duel-deckrow"><button onClick={() => send({ t: "removeBot" })}>Remove bot</button></div>
      )}
      {stage === "lobby" && seated && !opp && <p className="muted">Share this page's link with your opponent, or wait for someone to join from the lobby.</p>}

      {seated && stage !== "duel" && variant !== "end" && (
        <button className="duel-leave" onClick={() => send({ t: "leave" })}>Leave seat</button>
      )}
    </div>
  );
}

function SeatCard({ seat, index, you }: { seat: SeatInfo | null; index: 0 | 1; you: Seat | null }) {
  const status = !seat ? "Waiting for a player…" : !seat.connected ? "Disconnected — seat kept for a few minutes" : seat.ready ? "Ready" : "Choosing a deck…";
  return (
    <div className={`pd-seat ${you === index ? "is-you" : ""} ${seat?.ready ? "is-ready" : ""} ${index === 1 ? "is-right" : ""}`}>
      <div className={`pd-seat-pile ${seat ? "" : "is-empty"}`} aria-hidden="true">
        {seat?.ready ? <><span><SleeveBack sleeve={seat.sleeve} /></span><span><SleeveBack sleeve={seat.sleeve} /></span></> : <span className="pd-seat-ghost">?</span>}
      </div>
      {seat && <span className="pf-avatar" style={avatarStyle(seat.profile)} aria-hidden="true">{seat.profile?.avatar ? "" : (seat.name[0] ?? "?").toUpperCase()}</span>}
      <div className="pd-seat-text">
        <div className="duel-seat-head">
          <span className={`duel-dot ${seat?.connected ? "is-on" : seat ? "is-off" : ""}`} />
          <b>{seat ? seat.name : "Empty seat"}</b>
          {you === index && <span className="duel-chip">you</span>}
          {index === 0 && seat && !seat.bot && <span className="duel-chip" title="The host sets the room's rules">host</span>}
          {seat?.bot && <span className="duel-chip">bot</span>}
        </div>
        {seat?.profile?.title && <span className="pf-title">{seat.profile.title}</span>}
        <div className={`pd-seat-status ${seat?.ready ? "is-ready" : ""}`}>{status}</div>
        {seat?.deck && <div className="muted pd-seat-deck">Main {seat.deck.main} · Extra {seat.deck.extra} · Side {seat.deck.side}</div>}
        {seat?.ready && <div className="muted pd-seat-deck">Sleeve: {sleeveLabel(seat.sleeve, (id) => catalog.get(id)?.name)}</div>}
      </div>
      {seat?.profile?.showcase && <span className="pd-showcase" title="Showcase card"><img src={cardImage(seat.profile.showcase, "small")} alt="" /></span>}
    </div>
  );
}

/** Card types in the deck and its most-played cards. */
function DeckSummary({ deck }: { deck: Deck }) {
  const [, setV] = useState(0);
  useEffect(() => { void ensureCards([...deck.main, ...deck.extra]).then(() => setV((v) => v + 1)); }, [deck]);
  const t = (id: number) => (cardOf(id).type ?? "").toLowerCase();
  const main = { monster: 0, spell: 0, trap: 0 };
  for (const id of deck.main) { const ty = t(id); if (ty.includes("spell")) main.spell++; else if (ty.includes("trap")) main.trap++; else main.monster++; }
  const ex: Record<string, number> = {};
  for (const id of deck.extra) { const k = ["fusion", "synchro", "xyz", "link"].find((x) => t(id).includes(x)) ?? "other"; ex[k] = (ex[k] ?? 0) + 1; }
  const top = useMemo(() => {
    const n = new Map<number, number>();
    for (const id of deck.main) n.set(id, (n.get(id) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [deck]);
  return (
    <div className="pd-summary">
      <div className="pd-bars" aria-label="Main Deck card types">
        <span className="pd-bar is-monster" style={{ flex: main.monster || 0.001 }} title={`${main.monster} monsters`}>{main.monster || ""}</span>
        <span className="pd-bar is-spell" style={{ flex: main.spell || 0.001 }} title={`${main.spell} spells`}>{main.spell || ""}</span>
        <span className="pd-bar is-trap" style={{ flex: main.trap || 0.001 }} title={`${main.trap} traps`}>{main.trap || ""}</span>
      </div>
      <div className="muted pd-counts">
        {main.monster} monsters · {main.spell} spells · {main.trap} traps
        {deck.extra.length > 0 && <> · Extra: {Object.entries(ex).map(([k, v]) => `${v} ${k[0].toUpperCase()}${k.slice(1)}`).join(", ")}</>}
      </div>
      <div className="pd-top">
        {top.map(([id, n]) => (
          <span key={id} className="pd-top-card" title={`${cardOf(id).name} ×${n}`}>
            <img src={cardImage(id, "small")} alt={cardOf(id).name} loading="lazy" />
            {n > 1 && <b>×{n}</b>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One-click sleeves: a few designs and this deck's most-played cards. */
function QuickSleeves({ deck, onPick }: { deck: Deck; onPick(s: string): void }) {
  const picks = useMemo(() => {
    const n = new Map<number, number>();
    for (const id of [...deck.main, ...deck.extra]) n.set(id, (n.get(id) ?? 0) + 1);
    const art = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => `art:${id}`);
    return [...art, "design:classic", "design:midnight", "design:crimson", "design:gold"];
  }, [deck]);
  return (
    <div className="pd-quick" role="group" aria-label="Quick sleeves">
      {picks.map((s) => (
        <button key={s} type="button" className={deck.sleeve === s || (!deck.sleeve && s === "design:classic") ? "is-on" : ""} onClick={() => onPick(s)} title={sleeveLabel(s, (id) => cardOf(id).name)}>
          <SleeveBack sleeve={s} />
        </button>
      ))}
    </div>
  );
}

function InviteLink() {
  const [copied, setCopied] = useState(false);
  const url = location.href.replace(/[?#].*$/, "");
  return (
    <div className="pd-invite">
      <input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={() => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined)}>
        {copied ? "Copied!" : "Copy invite link"}
      </button>
    </div>
  );
}

/** A few of this browser's duel preferences (the rest are in ⚙ during the duel). */
function ViewPanel() {
  const ds = useDuelSettings();
  const toggle = (k: "autoPlace" | "confirmEnd" | "callouts" | "stats", label: string, title: string) => (
    <label className="pd-toggle" title={title}><input type="checkbox" checked={ds[k]} onChange={(e) => setDuelSetting(k, e.target.checked)} /> {label}</label>
  );
  return (
    <section className="pd-panel pd-view">
      <h3>Your duel view <small className="muted">· this browser</small></h3>
      <label className="pd-field">
        <span>Effect resolving</span>
        <select value={ds.resolveFx} onChange={(e) => setDuelSetting("resolveFx", e.target.value as ResolveFx)}>
          {RESOLVE_FX.map((f) => <option key={f} value={f}>{RESOLVE_FX_LABEL[f]}</option>)}
        </select>
      </label>
      <label className="pd-field">
        <span>Summons</span>
        <select value={ds.summonFx} onChange={(e) => setDuelSetting("summonFx", e.target.value as SummonFxMode)}>
          {SUMMON_FX.map((f) => <option key={f} value={f}>{SUMMON_FX_LABEL[f]}</option>)}
        </select>
      </label>
      <label className="pd-field">
        <span>Summons shown as</span>
        <select value={ds.summonSplash} onChange={(e) => setDuelSetting("summonSplash", e.target.value as SplashStyle)} aria-label="Summons shown as">
          {SPLASH_STYLES.map((f) => <option key={f} value={f}>{SPLASH_STYLE_LABEL[f]}</option>)}
        </select>
      </label>
      <label className="pd-field">
        <span>Activations shown as</span>
        <select value={ds.activateSplash} onChange={(e) => setDuelSetting("activateSplash", e.target.value as SplashStyle)} aria-label="Activations shown as">
          {SPLASH_STYLES.map((f) => <option key={f} value={f}>{SPLASH_STYLE_LABEL[f]}</option>)}
        </select>
      </label>
      <label className="pd-field">
        <span>Effect colour</span>
        <select value={ds.resolveColor} onChange={(e) => setDuelSetting("resolveColor", e.target.value as ResolveColor)}>
          {RESOLVE_COLORS.map((c) => <option key={c} value={c}>{RESOLVE_COLOR_LABEL[c]}</option>)}
        </select>
      </label>
      <label className="pd-field">
        <span>3D tilt <b>{ds.tilt}°</b></span>
        <input type="range" min={0} max={TILT_MAX} value={ds.tilt} onChange={(e) => setDuelSetting("tilt", Number(e.target.value))} />
      </label>
      <SoundThemePicker className="pd-field" />
      <div className="pd-toggles">
        {toggle("autoPlace", "Place cards for me", "Summoned / Set cards go to a zone by themselves instead of asking")}
        {toggle("confirmEnd", "Confirm ending a turn", "Ask before ending the turn with an unused Normal Summon")}
        {toggle("callouts", "Big callouts", "The big \"CHAIN?\" / \"YOUR MOVE\" callouts")}
        {toggle("stats", "ATK / DEF on cards", "ATK / DEF under face-up monsters")}
      </div>
      <span className="duel-deckrow"><a className="pd-link" href="/dev/summons" target="_blank" rel="noreferrer">Preview summons →</a><a className="pd-link" href="/dev/fx" target="_blank" rel="noreferrer">Preview resolving effects →</a></span>
    </section>
  );
}

interface EndTab { id: string; label: string; node: ReactNode }
function EndTabsView({ tabs }: { tabs: EndTab[] }) {
  const [tab, setTab] = useState(tabs[0]?.id ?? "rules");
  const cur = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <div className="pd-endtabs">
      <div className="pd-endtabs-bar" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === cur?.id} className={t.id === cur?.id ? "is-on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="pd-endtabs-body" role="tabpanel">{cur?.node}</div>
    </div>
  );
}
