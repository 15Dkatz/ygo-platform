import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth.tsx";
import { ApiError } from "../api.ts";
import "./LoginPage.css";

// PHASE 2 owns this page (sign in / register).

const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

/** Only same-app paths ("/decks", not "//evil.com" or "https://..."). */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login")) return "/library";
  return raw;
}

type Mode = "signin" | "register";

export function LoginPage() {
  const { user, loading, login, register, logout } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const next = safeNext(params.get("next") ?? (location.state as { from?: string } | null)?.from);

  const [mode, setMode] = useState<Mode>(params.get("mode") === "register" ? "register" : "signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setError(null), [mode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = username.trim();
    if (mode === "register") {
      if (!USERNAME_RE.test(name)) return setError("Username must be 3–20 characters: letters, numbers, _ or -.");
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords don't match.");
    } else if (!name || !password) {
      return setError("Enter your username and password.");
    }
    setBusy(true);
    try {
      await (mode === "register" ? register(name, password) : login(name, password));
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Check your connection and try again.");
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="login-page"><p className="muted">Checking your session…</p></section>;

  if (user) {
    return (
      <section className="login-page">
        <div className="login-card">
          <h1>You're signed in</h1>
          <p>
            Signed in as <strong>{user.username}</strong>. Your decks and tags are saved to your account.
          </p>
          <div className="login-actions">
            <Link to={next} className="login-button primary">Continue</Link>
            <button type="button" onClick={() => void logout()}>Sign out</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-tabs" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <h1>{mode === "signin" ? "Sign in" : "Create an account"}</h1>
          <p className="muted login-intro">
            {mode === "signin"
              ? "Sign in to keep your decks and tags in your account and use them on any device."
              : "Save your decks and tags to an account. No email needed."}
          </p>

          <label className="login-field">
            <span>Username</span>
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
            {mode === "register" && <small className="muted">3–20 characters: letters, numbers, _ or -</small>}
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : undefined}
            />
            {mode === "register" && <small className="muted">At least 8 characters</small>}
          </label>

          {mode === "register" && (
            <label className="login-field">
              <span>Confirm password</span>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary login-submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <p className="muted login-switch">
            {mode === "signin" ? (
              <>New here? <button type="button" className="link" onClick={() => setMode("register")}>Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" className="link" onClick={() => setMode("signin")}>Sign in</button></>
            )}
          </p>
        </form>
      </div>
    </section>
  );
}
