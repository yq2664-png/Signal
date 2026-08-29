"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addSeen,
  EMPTY_SEEN,
  excludeSeen,
  loadSeen,
  mergeSeen,
  saveSeen,
  type SeenIndex,
} from "@/lib/seen-posts";
import type { FeedItem } from "@/lib/types";

export function useSeenPosts() {
  const [committed, setCommitted] = useState<SeenIndex>(EMPTY_SEEN);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<SeenIndex>(EMPTY_SEEN);
  const committedRef = useRef<SeenIndex>(EMPTY_SEEN);

  useEffect(() => {
    const loaded = loadSeen();
    committedRef.current = loaded;
    setCommitted(loaded);
    setReady(true);
  }, []);

  const markSeen = useCallback((item: Pick<FeedItem, "id" | "url">) => {
    pendingRef.current = addSeen(pendingRef.current, item);
  }, []);

  const commitSeen = useCallback(() => {
    const pending = pendingRef.current;
    if (pending.ids.length === 0 && pending.urls.length === 0) return;
    pendingRef.current = EMPTY_SEEN;
    const next = mergeSeen(committedRef.current, pending);
    committedRef.current = next;
    saveSeen(next);
    setCommitted(next);
  }, []);

  const hideSeen = useCallback(
    <T extends Pick<FeedItem, "id" | "url">>(items: T[]) =>
      excludeSeen(items, committed),
    [committed]
  );

  return { markSeen, commitSeen, hideSeen, committed, ready };
}
