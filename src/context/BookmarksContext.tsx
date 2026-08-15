"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useLibraryCollection } from "@/context/useLibraryCollection";
import type { FeedItem } from "@/lib/types";

type BookmarksContextValue = {
  ready: boolean;
  count: number;
  bookmarkedItems: FeedItem[];
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (item: FeedItem) => void;
};

const BookmarksContext = createContext<BookmarksContextValue | null>(null);

const SAVE_COPY = {
  added: "Saved.",
  removed: "Removed from Saved.",
  failed: "Couldn’t update Saved. Try again.",
  signIn: "Sign in to save items.",
};

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const { ready, items, toggle } = useLibraryCollection("saves", SAVE_COPY);

  const isBookmarked = useCallback(
    (id: string) => items.some((item) => item.id === id),
    [items]
  );

  const value = useMemo(
    () => ({
      ready,
      count: items.length,
      bookmarkedItems: items,
      isBookmarked,
      toggleBookmark: toggle,
    }),
    [ready, items, isBookmarked, toggle]
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
