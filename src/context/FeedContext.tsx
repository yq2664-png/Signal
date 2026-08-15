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

  useEffect(() => {
    let cancelled = false;
    const force = forceRef.current;
    forceRef.current = false;

    setLoading(true);
    setError(null);

    const url = force ? "/api/feed?force=1" : "/api/feed";

    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Feed API ${res.status}`);
        return res.json() as Promise<FeedPayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        setItems(payload.items);
        setInsights(payload.insights ?? []);
        setMeta(payload.meta);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load live feed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    forceRef.current = false;
    setTick((t) => t + 1);
  }, []);

  const forceRefresh = useCallback(() => {
    forceRef.current = true;
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
