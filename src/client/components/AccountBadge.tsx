import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.tsx";
import { localDeckStore } from "../store/deckStore.ts";
import { hasLocalData, uploadLocalData } from "../store/serverDeckStore.ts";
import type { User } from "../../shared/types.ts";
import "./AccountBadge.css";

// PHASE 2 owns this component: show the signed-in username + sign out, or a Sign in link.
// It also hosts the one-time "upload decks from this browser" offer after sign-in.

export function AccountBadge() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [location.pathname, user]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) return <span className="account account-loading" aria-hidden="true" />;

  if (!user) {
    const here = location.pathname + location.search;
    const to = location.pathname === "/login" ? "/login" : `/login?next=${encodeURIComponent(here)}`;
    return <Link to={to} className="account account-signin">Sign in</Link>;
  }

  return (
    <div className="account account-menu" ref={ref}>
      <button
        type="button"
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={`Signed in as ${user.username}`}
      >
        <span className="account-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
        <span className="account-name">{user.username}</span>
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <p className="account-who muted">Signed in as <strong>{user.username}</strong></p>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      )}
      <LocalUploadOffer user={user} />
    </div>
  );
}

const offeredKey = (userId: string) => `ygo.uploadOffered.${userId}`;
function wasOffered(userId: string) {
  try {
    return localStorage.getItem(offeredKey(userId)) === "1";
  } catch {
    return true;
  }
}
function markOffered(userId: string) {
  try {
    localStorage.setItem(offeredKey(userId), "1");
  } catch {
    /* ignore */
  }
}

/** Once per account per browser: if this browser has signed-out decks/tags, offer to move them. */
function LocalUploadOffer({ user }: { user: User }) {
  const [found, setFound] = useState<{ decks: number; tags: number } | null>(null);
  const [state, setState] = useState<"ask" | "busy" | "done" | "error">("ask");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setFound(null);
    setState("ask");
    if (wasOffered(user.id)) return;
    let cancelled = false;
    hasLocalData(localDeckStore).then((f) => {
      if (cancelled) return;
      if (f.decks || f.tags) setFound(f);
      else markOffered(user.id);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (!found) return null;

  const close = () => {
    markOffered(user.id);
    setFound(null);
  };
  const upload = async () => {
    setState("busy");
    try {
      const r = await uploadLocalData(localDeckStore);
      markOffered(user.id);
      setState("done");
      setMessage(`Uploaded ${plural(r.decks, "deck")}${r.tags ? ` and tags for ${plural(r.tags, "card")}` : ""}.`);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const what = [found.decks ? plural(found.decks, "deck") : "", found.tags ? `tags for ${plural(found.tags, "card")}` : ""]
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="upload-offer" role="dialog" aria-labelledby="upload-offer-title">
      <h2 id="upload-offer-title">Save this browser's decks to your account?</h2>
      {state === "done" ? (
        <>
          <p>{message} They're now in your account and have been removed from this browser.</p>
          <div className="upload-offer-actions">
            <button type="button" className="primary" onClick={() => setFound(null)}>OK</button>
          </div>
        </>
      ) : (
        <>
          <p>
            This browser has {what} saved while you were signed out. Upload them to <strong>{user.username}</strong>? The
            local copies are removed once the upload succeeds.
          </p>
          {state === "error" && <p className="upload-offer-error" role="alert">Upload failed: {message}. Your local decks were kept.</p>}
          <div className="upload-offer-actions">
            <button type="button" onClick={close} disabled={state === "busy"}>Not now</button>
            <button type="button" className="primary" onClick={upload} disabled={state === "busy"}>
              {state === "busy" ? "Uploading…" : state === "error" ? "Try again" : "Upload"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
