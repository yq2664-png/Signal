"use client";

import { SavedBoardPage } from "@/components/workspace/SavedBoardPage";
import { useAuth } from "@/context/AuthContext";
import { useBookmarks } from "@/context/BookmarksContext";

export default function SavedPage() {
  const { user, openAuth } = useAuth();
  const { bookmarkedItems, ready, count } = useBookmarks();

  return (
    <SavedBoardPage
      title="Saved"
      subtitle={
        user
          ? `${count} saved · synced to ${user.email}`
          : "Sign in to sync saves across devices"
      }
      items={bookmarkedItems}
      ready={ready}
      emptyMessage={
        user
          ? "No saved items yet. Bookmark cards in Feed to collect them here."
          : "Sign in to save items to your library."
      }
      emptyAction={
        user
          ? undefined
          : {
              label: "Sign in with email",
              onClick: () => openAuth(),
            }
      }
    />
  );
}
