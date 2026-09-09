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
import { useToast } from "@/components/ui/Toast";
import { timeoutAfter } from "@/lib/timeout";
import { sendEmailSignIn } from "@/lib/supabase/email-sign-in";

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
  signInWithEmail: (email: string) => Promise<{ ok: boolean; message: string }>;
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

function sameUser(left: AuthUser | null, right: AuthUser | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id && left.email === right.email;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const { toast } = useToast();
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
      const data = await Promise.race([
        loadUserPrefs(supabase),
        timeoutAfter(8_000, "library"),
      ]);
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
      } = await Promise.race([
        supabase.auth.getUser(),
        timeoutAfter(5_000, "auth lookup"),
      ]);
      setUser((prev) => {
        const next = sessionUser
          ? toAuthUser(sessionUser.id, sessionUser.email ?? undefined)
          : null;
        return sameUser(prev, next) ? prev : next;
      });
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
    let libraryTimer: ReturnType<typeof setTimeout> | undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user
        ? toAuthUser(session.user.id, session.user.email ?? undefined)
        : null;
      setUser((prev) => (sameUser(prev, next) ? prev : next));
      clearTimeout(libraryTimer);
      // Auth notifications run under the session lock. Start additional
      // Supabase requests only after this callback has returned.
      if (next) libraryTimer = setTimeout(() => {
        void hydrateLibrary().catch((err) => console.error("[auth] library refresh", err));
      }, 0);
      else {
        setPrefs(null);
        setCounts({ likes: 0, saves: 0 });
      }
      setReady(true);
    });

    return () => {
      clearTimeout(libraryTimer);
      subscription.unsubscribe();
    };
  }, [configured, refreshAuth, hydrateLibrary]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (!auth) return;
    params.delete("auth");
    const next = `${window.location.pathname}${
      params.toString() ? `?${params}` : ""
    }`;
    window.history.replaceState({}, "", next);

    if (auth === "expired") {
      toast("Sign-in failed or expired. Try again.", "error");
      setAuthOpen(true);
      setAuthMessage("Sign-in failed or expired. Try again.");
      return;
    }

    if (auth !== "ok") return;

    void (async () => {
      const supabase = createClient();
      let sessionUser: { id: string; email?: string } | null = null;
      try {
        const result = await Promise.race([
          supabase.auth.getUser(),
          timeoutAfter(5_000, "auth lookup"),
        ]);
        sessionUser = result.data.user;
      } catch (err) {
        console.error("[auth] session check after callback", err);
      }
      await refreshAuth();
      if (sessionUser) {
        toast("Signed in. Likes and saves will sync.", "success");
        setAuthMessage(null);
        setAuthOpen(false);
      } else {
        toast(
          "The sign-in session could not be loaded. Try again.",
          "error"
        );
        setAuthOpen(true);
        setAuthMessage(
          "Your sign-in session could not be loaded. Please sign in again."
        );
      }
    })();
  }, [refreshAuth, toast]);

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
      openAuth(message ?? "Sign in to like and save items.");
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
    try {
      sessionStorage.setItem("signal-auth-return", window.location.origin);
    } catch {
      /* ignore */
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
          redirect_to: redirectTo,
        },
      },
    });
    if (error || !data.url) {
      return {
        ok: false,
        message: error?.message ?? "Google sign-in is not available.",
      };
    }
    const oauthUrl = new URL(data.url);
    oauthUrl.searchParams.set("redirect_to", redirectTo);
    window.location.assign(oauthUrl.toString());
    return { ok: true, message: "Redirecting to Google…" };
  }, [configured]);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!configured) return { ok: false, message: "Sign-in is currently unavailable." };
    return sendEmailSignIn(createClient(), email, window.location.origin);
  }, [configured]);

  const logout = useCallback(async () => {
    if (!configured) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setPrefs(null);
    setCounts({ likes: 0, saves: 0 });
    toast("Signed out.", "default");
  }, [configured, toast]);

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
      signInWithEmail,
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
      signInWithEmail,
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
