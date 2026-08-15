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

const LIKE_COPY = {
  added: "Added to Liked.",
  removed: "Removed from Liked.",
  failed: "Couldn’t update Liked. Try again.",
  signIn: "Sign in to like items.",
};

export function LikesProvider({ children }: { children: ReactNode }) {
  const { ready, items, toggle } = useLibraryCollection("likes", LIKE_COPY);

  const likedIds = useMemo(() => items.map((item) => item.id), [items]);
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
      ready,
      count: items.length,
      likedIds,
      likedItems: items,
      getLikes,
      isLiked,
      toggleLike: toggle,
    }),
    [ready, items, likedIds, getLikes, isLiked, toggle]
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
