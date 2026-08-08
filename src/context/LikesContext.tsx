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
import { useAuth } from "@/context/AuthContext";
import { fetchLibrary, toggleLibraryItem } from "@/lib/library-api";
import { prefsFromItems } from "@/lib/personalization";
import { createClient } from "@/lib/supabase/client";
import type { FeedItem } from "@/lib/types";

type LikesContextValue = {
  ready: boolean;
  count: number;
  likedIds: string[];
  likedItems: FeedItem[];
  getLikes: (id: string) => number;
  isLiked: (id: string) => boolean;
  toggleLike: (item: FeedItem) => void;
};

const LikesContext = createContext<LikesContextValue | null>(null);

export function LikesProvider({ children }: { children: ReactNode }) {
  const {
    user,
    ready: authReady,
    requireAuth,
    setPrefs,
    setCounts,
    configured,
  } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  const syncPrefs = useCallback(
    async (liked: FeedItem[]) => {
      try {
        const supabase = createClient();
        const saved = await fetchLibrary(supabase, "saves");
        setPrefs(prefsFromItems(liked, saved));
        setCounts({ likes: liked.length, saves: saved.length });
      } catch (err) {
        console.error(err);
      }
    },
    [setPrefs, setCounts]
  );

  const load = useCallback(async () => {
    if (!configured || !user) {
      setItems([]);
      setReady(true);
      return;
    }
    try {
      const supabase = createClient();
      const liked = await fetchLibrary(supabase, "likes");
      setItems(liked);
      await syncPrefs(liked);
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setReady(true);
    }
  }, [configured, user, syncPrefs]);

  useEffect(() => {
    if (!authReady) return;
    setReady(false);
    void load();
  }, [authReady, load]);

  const toggleLike = useCallback(
    (item: FeedItem) => {
      if (!requireAuth("Sign in to like items — we use this for your ranking.")) {
        return;
      }
      if (!user || pending) return;

      setItems((prev) => {
        const exists = prev.some((x) => x.id === item.id);
        return exists ? prev.filter((x) => x.id !== item.id) : [item, ...prev];
      });

      setPending(true);
      const supabase = createClient();
      void toggleLibraryItem(supabase, "likes", user.id, item)
        .then(async ({ items: next }) => {
          setItems(next);
          await syncPrefs(next);
        })
        .catch(async (err) => {
          console.error(err);
          await load();
        })
        .finally(() => setPending(false));
    },
    [requireAuth, user, pending, syncPrefs, load]
  );

  const likedIds = useMemo(() => items.map((i) => i.id), [items]);
  const getLikes = useCallback(
    (id: string) => (likedIds.includes(id) ? 1 : 0),
    [likedIds]
  );
  const isLiked = useCallback(
    (id: string) => likedIds.includes(id),
    [likedIds]
  );

  const value = useMemo(
    () => ({
      ready: ready && authReady,
      count: items.length,
      likedIds,
      likedItems: items,
      getLikes,
      isLiked,
      toggleLike,
    }),
    [ready, authReady, items, likedIds, getLikes, isLiked, toggleLike]
  );

  return (
    <LikesContext.Provider value={value}>{children}</LikesContext.Provider>
  );
}

export function useLikes() {
  const ctx = useContext(LikesContext);
  if (!ctx) throw new Error("useLikes must be used within LikesProvider");
  return ctx;
}
