import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api.ts";
import type { User } from "../shared/types.ts";

// PHASE 2: who is signed in. Session lives in an HttpOnly cookie, so the client only
// ever learns the user via /api/auth/me|login|register.

export interface AuthState {
  user: User | null;
  /** true until the first /api/auth/me answer arrives */
  loading: boolean;
  login(username: string, password: string): Promise<User>;
  register(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Resolved once the first /me answer is known; lets the deck store wait instead of
// briefly showing localStorage decks to a signed-in user.
let resolveReady: (user: User | null) => void;
let current: Promise<User | null> = new Promise((r) => (resolveReady = r));
/** The signed-in user once known (used by stores outside React). */
export const whenAuthKnown = () => current;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((u: User | null) => {
    setUser(u);
    setLoading(false);
    resolveReady(u);
    current = Promise.resolve(u);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ user: User | null }>("/api/auth/me")
      .then((r) => !cancelled && apply(r.user))
      .catch(() => !cancelled && apply(null));
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const login = useCallback(
    async (username: string, password: string) => {
      const r = await api<{ user: User }>("/api/auth/login", { method: "POST", json: { username, password } });
      apply(r.user);
      return r.user;
    },
    [apply],
  );
  const register = useCallback(
    async (username: string, password: string) => {
      const r = await api<{ user: User }>("/api/auth/register", { method: "POST", json: { username, password } });
      apply(r.user);
      return r.user;
    },
    [apply],
  );
  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      apply(null);
    }
  }, [apply]);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>");
  return ctx;
}

/** Like useAuth(), but returns null outside the provider (for code that also runs signed-out in tests). */
export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext);
}
