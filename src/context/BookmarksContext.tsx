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

type BookmarksContextValue = {
  ready: boolean;
  count: number;
  bookmarkedItems: FeedItem[];
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (item: FeedItem) => void;
};

const BookmarksContext = createContext<BookmarksContextValue | null>(null);

export function BookmarksProvider({ children }: { children: ReactNode }) {
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
    async (saved: FeedItem[]) => {
      try {
        const supabase = createClient();
        const liked = await fetchLibrary(supabase, "likes");
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
      const saved = await fetchLibrary(supabase, "saves");
      setItems(saved);
      await syncPrefs(saved);
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

  const toggleBookmark = useCallback(
    (item: FeedItem) => {
      if (!requireAuth("Sign in to save items to your library.")) return;
      if (!user || pending) return;

      setItems((prev) => {
        const exists = prev.some((x) => x.id === item.id);
        return exists ? prev.filter((x) => x.id !== item.id) : [item, ...prev];
      });

      setPending(true);
      const supabase = createClient();
      void toggleLibraryItem(supabase, "saves", user.id, item)
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

  const isBookmarked = useCallback(
    (id: string) => items.some((item) => item.id === id),
    [items]
  );

  const value = useMemo(
    () => ({
      ready: ready && authReady,
      count: items.length,
      bookmarkedItems: items,
      isBookmarked,
      toggleBookmark,
    }),
    [ready, authReady, items, isBookmarked, toggleBookmark]
  );

  return (
    <BookmarksContext.Provider value={value}>
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks() {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error("useBookmarks must be used within BookmarksProvider");
  return ctx;
}
