"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadUserPrefs } from "@/lib/library-api";
import type { UserPrefs } from "@/lib/personalization";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type AuthUser = {
  id: string;
  email: string;
};

type AuthContextValue = {
  ready: boolean;
  configured: boolean;
  user: AuthUser | null;
  prefs: UserPrefs | null;
  counts: { likes: number; saves: number };
  authOpen: boolean;
  openAuth: (message?: string) => void;
  closeAuth: () => void;
  authMessage: string | null;
  signInWithGoogle: () => Promise<{ ok: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setPrefs: (prefs: UserPrefs | null) => void;
  setCounts: (counts: { likes: number; saves: number }) => void;
  requireAuth: (message?: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(id: string, email: string | undefined): AuthUser | null {
  if (!email) return null;
  return { id, email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [counts, setCounts] = useState({ likes: 0, saves: 0 });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const hydrateLibrary = useCallback(async () => {
    if (!configured) {
      setPrefs(null);
      setCounts({ likes: 0, saves: 0 });
      return;
    }
    const supabase = createClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    if (!sessionUser) {
      setPrefs(null);
      setCounts({ likes: 0, saves: 0 });
      return;
    }
    try {
      const data = await loadUserPrefs(supabase);
      setPrefs(data.prefs);
      setCounts(data.counts);
    } catch (err) {
      console.error("[auth] failed to load library prefs", err);
    }
  }, [configured]);

  const refreshAuth = useCallback(async () => {
    if (!configured) {
      setUser(null);
      setPrefs(null);
      setCounts({ likes: 0, saves: 0 });
      setReady(true);
      return;
    }

    try {
      const supabase = createClient();
      const {
        data: { user: sessionUser },
      } = await supabase.auth.getUser();
      setUser(
        sessionUser
          ? toAuthUser(sessionUser.id, sessionUser.email ?? undefined)
          : null
      );
      if (sessionUser) await hydrateLibrary();
      else {
        setPrefs(null);
        setCounts({ likes: 0, saves: 0 });
      }
    } catch (err) {
      console.error(err);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, [configured, hydrateLibrary]);

  useEffect(() => {
    void refreshAuth();
    if (!configured) return;

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const next = session?.user
        ? toAuthUser(session.user.id, session.user.email ?? undefined)
        : null;
      setUser(next);
      if (next) await hydrateLibrary();
      else {
        setPrefs(null);
        setCounts({ likes: 0, saves: 0 });
      }
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, [configured, refreshAuth, hydrateLibrary]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (!auth) return;
    if (auth === "ok") {
      void refreshAuth();
      setAuthMessage("Signed in with Google. Likes and Saves sync to your account.");
      setAuthOpen(false);
    } else if (auth === "expired") {
      setAuthOpen(true);
      setAuthMessage("Google sign-in failed or expired. Try again.");
    }
    params.delete("auth");
    const next = `${window.location.pathname}${
      params.toString() ? `?${params}` : ""
    }`;
    window.history.replaceState({}, "", next);
  }, [refreshAuth]);

  const openAuth = useCallback((message?: string) => {
    setAuthMessage(message ?? null);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
  }, []);

  const requireAuth = useCallback(
    (message?: string) => {
      if (!configured) {
        openAuth(
          "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart."
        );
        return false;
      }
      if (user) return true;
      openAuth(message ?? "Sign in with Google to like and save items.");
      return false;
    },
    [configured, user, openAuth]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!configured) {
      return { ok: false, message: "Supabase is not configured." };
    }
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, message: "Redirecting to Google…" };
  }, [configured]);

  const logout = useCallback(async () => {
    if (!configured) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setPrefs(null);
    setCounts({ likes: 0, saves: 0 });
  }, [configured]);

  const value = useMemo(
    () => ({
      ready,
      configured,
      user,
      prefs,
      counts,
      authOpen,
      openAuth,
      closeAuth,
      authMessage,
      signInWithGoogle,
      logout,
      refreshAuth,
      setPrefs,
      setCounts,
      requireAuth,
    }),
    [
      ready,
      configured,
      user,
      prefs,
      counts,
      authOpen,
      openAuth,
      closeAuth,
      authMessage,
      signInWithGoogle,
      logout,
      refreshAuth,
      requireAuth,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
