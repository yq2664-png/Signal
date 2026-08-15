"use client";

import { useMemo } from "react";
import { SavedBoardPage } from "@/components/workspace/SavedBoardPage";
import { useAuth } from "@/context/AuthContext";
import { useFeed } from "@/context/FeedContext";
import { useLikes } from "@/context/LikesContext";
import type { FeedItem } from "@/lib/types";

export default function LikedPage() {
  const { user, openAuth } = useAuth();
  const { likedIds, likedItems, ready, count } = useLikes();
  const { items: liveItems } = useFeed();

  const items = useMemo(() => {
    const liveById = new Map(liveItems.map((item) => [item.id, item]));
    const snapById = new Map(likedItems.map((item) => [item.id, item]));
    return likedIds
      .map((id) => liveById.get(id) ?? snapById.get(id))
      .filter((item): item is FeedItem => Boolean(item));
  }, [likedIds, likedItems, liveItems]);

  return (
    <SavedBoardPage
      title="Liked"
      subtitle={
        user
          ? `${count} liked · synced to ${user.email}`
          : "Sign in to sync likes across devices"
      }
      items={items}
      ready={ready}
      emptyMessage={
        user
          ? "No likes yet. Heart items in Feed to collect them here."
          : "Sign in to like items across devices."
      }
      emptyAction={
        user
          ? undefined
          : {
              label: "Sign in with Google",
              onClick: () => openAuth(),
            }
      }
    />
  );
}
