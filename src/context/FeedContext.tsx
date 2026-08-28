"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FeedPayload } from "@/lib/live/aggregate";
import type { FeedItem, Insight } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

type FeedContextValue = {
  items: FeedItem[];
  insights: Insight[];
  meta: FeedPayload["meta"] | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Soft refresh — hits 30m server snapshot (fast) */
  refresh: () => void;
  /** Hard refresh — bypass snapshot and re-crawl sources */
  forceRefresh: () => void;
};

const FeedContext = createContext<FeedContextValue | null>(null);

const WARMING_POLLS = 12;
const REFRESH_POLLS = 30;
const POLL_MS = 2_000;

export function FeedProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [meta, setMeta] = useState<FeedPayload["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const forceRef = useRef(false);
  const userRefreshRef = useRef(false);
  const refreshAnchorRef = useRef<string | null>(null);
  const warmingTries = useRef(0);
  const itemsRef = useRef<FeedItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const force = forceRef.current;
    forceRef.current = false;
    const userRefresh = userRefreshRef.current;
    const hasItems = itemsRef.current.length > 0;

    if (warmingTries.current === 0) {
      if (!hasItems) setLoading(true);
      if (userRefresh) setRefreshing(true);
      if (!userRefresh) setError(null);
    }

    const url = force ? "/api/feed?force=1" : "/api/feed";
    const controller = new AbortController();
    const abortTimer = setTimeout(
      () => controller.abort(),
      force || userRefresh ? 20_000 : 12_000
    );

    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Feed API ${res.status}`);
        return res.json() as Promise<FeedPayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (payload.items.length > 0) {
          setItems(payload.items);
          setInsights(payload.insights ?? []);
        } else if (!payload.meta.warming) {
          setItems(payload.items);
          setInsights(payload.insights ?? []);
        }
        setMeta(payload.meta);

        const stillWarming =
          Boolean(payload.meta.warming) && payload.items.length === 0;
        const waitForRefresh =
          userRefresh && Boolean(payload.meta.pendingRefresh);
        const pollLimit = waitForRefresh ? REFRESH_POLLS : WARMING_POLLS;

        if ((stillWarming || waitForRefresh) && warmingTries.current < pollLimit) {
          warmingTries.current += 1;
          setLoading(false);
          retryTimer = setTimeout(() => setTick((t) => t + 1), POLL_MS);
          return;
        }

        if (stillWarming) {
          setError("Feed is still building");
        }

        if (userRefreshRef.current) {
          const moved =
            refreshAnchorRef.current &&
            payload.meta.fetchedAt !== refreshAnchorRef.current;
          toastRef.current(
            moved
              ? "Feed updated."
              : payload.meta.pendingRefresh
                ? "Still using the last feed. Refresh is taking longer."
                : "Feed is up to date.",
            moved ? "success" : "default"
          );
          userRefreshRef.current = false;
          refreshAnchorRef.current = null;
        }

        warmingTries.current = 0;
        setLoading(false);
        setRefreshing(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const aborted =
          err instanceof DOMException
            ? err.name === "AbortError"
            : err instanceof Error && err.name === "AbortError";
        setError(
          aborted
            ? "Feed request timed out"
            : err instanceof Error
              ? err.message
              : "Failed to load live feed"
        );
        if (userRefreshRef.current) {
          toastRef.current(
            aborted ? "Refresh timed out." : "Couldn’t refresh the feed.",
            "error"
          );
          userRefreshRef.current = false;
          refreshAnchorRef.current = null;
        }
        setLoading(false);
        setRefreshing(false);
      })
      .finally(() => {
        clearTimeout(abortTimer);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(abortTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [tick]);

  const refresh = useCallback(() => {
    forceRef.current = false;
    userRefreshRef.current = true;
    refreshAnchorRef.current = meta?.fetchedAt ?? null;
    warmingTries.current = 0;
    setTick((t) => t + 1);
  }, [meta?.fetchedAt]);

  const forceRefresh = useCallback(() => {
    forceRef.current = true;
    userRefreshRef.current = true;
    refreshAnchorRef.current = meta?.fetchedAt ?? null;
    warmingTries.current = 0;
    setTick((t) => t + 1);
  }, [meta?.fetchedAt]);

  const value = useMemo(
    () => ({
      items,
      insights,
      meta,
      loading,
      refreshing,
      error,
      refresh,
      forceRefresh,
    }),
    [
      items,
      insights,
      meta,
      loading,
      refreshing,
      error,
      refresh,
      forceRefresh,
    ]
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used within FeedProvider");
  return ctx;
}
