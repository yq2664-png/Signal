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

type FeedContextValue = {
  items: FeedItem[];
  insights: Insight[];
  meta: FeedPayload["meta"] | null;
  loading: boolean;
  error: string | null;
  /** Soft refresh — hits 30m server snapshot (fast) */
  refresh: () => void;
  /** Hard refresh — bypass snapshot and re-crawl sources */
  forceRefresh: () => void;
};

const FeedContext = createContext<FeedContextValue | null>(null);

export function FeedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [meta, setMeta] = useState<FeedPayload["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const forceRef = useRef(false);
  const warmingTries = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const force = forceRef.current;
    forceRef.current = false;

    if (warmingTries.current === 0) {
      setLoading(true);
      setError(null);
    }

    const url = force ? "/api/feed?force=1" : "/api/feed";
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 12_000);

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

        if (payload.meta.warming && warmingTries.current < 10) {
          warmingTries.current += 1;
          setLoading(false);
          retryTimer = setTimeout(() => setTick((t) => t + 1), 2_000);
          return;
        }
        if (payload.meta.warming) {
          setError("Feed is still building");
        }
        warmingTries.current = 0;
        setLoading(false);
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
        setLoading(false);
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
    warmingTries.current = 0;
    setTick((t) => t + 1);
  }, []);

  const forceRefresh = useCallback(() => {
    forceRef.current = true;
    warmingTries.current = 0;
    setTick((t) => t + 1);
  }, []);

  const value = useMemo(
    () => ({
      items,
      insights,
      meta,
      loading,
      error,
      refresh,
      forceRefresh,
    }),
    [items, insights, meta, loading, error, refresh, forceRefresh]
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used within FeedProvider");
  return ctx;
}
