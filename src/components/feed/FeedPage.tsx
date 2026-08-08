"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FeedFilters, defaultFilters, type FeedFiltersState } from "@/components/feed/FeedFilters";
import { ImpactBriefDrawer } from "@/components/feed/ImpactBriefDrawer";
import {
  SourceBoard,
  SourceGroupChips,
} from "@/components/feed/SourceBoard";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useFeed } from "@/context/FeedContext";
import { useLikes } from "@/context/LikesContext";
import type { FeedItem } from "@/lib/types";
import { groupIdForSource, type SourceGroupId } from "@/lib/source-groups";
import { sortFeedBoard } from "@/lib/utils";

export function FeedPage() {
  const { items, meta, loading, error, refresh } = useFeed();
  const { prefs, user } = useAuth();
  const { getLikes, ready: likesReady } = useLikes();
  const getLikesRef = useRef(getLikes);
  getLikesRef.current = getLikes;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [filters, setFilters] = useState<FeedFiltersState>(defaultFilters);
  const [groupFilter, setGroupFilter] = useState<SourceGroupId | "all">("all");
  const [selectedId, setSelectedId] = useState("");
  const [briefOpen, setBriefOpen] = useState(true);
  const [filtered, setFiltered] = useState<FeedItem[]>([]);

  useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const searched = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [
        item.title,
        item.summary,
        item.source,
        item.category,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [filters.query, items]);

  const candidates = useMemo(() => {
    if (groupFilter === "all") return searched;
    return searched.filter(
      (item) => groupIdForSource(item.source) === groupFilter
    );
  }, [groupFilter, searched]);

  // Re-sort when candidates / auth prefs / likes hydrate — not on each like click.
  useEffect(() => {
    if (!likesReady && candidates.length === 0) {
      setFiltered([]);
      return;
    }
    setFiltered(
      sortFeedBoard(candidates, getLikesRef.current, prefsRef.current)
    );
  }, [candidates, likesReady, user?.id, prefs?.sampleSize]);

  const selected =
    filtered.find((item) => item.id === selectedId) ??
    items.find((item) => item.id === selectedId) ??
    filtered[0] ??
    null;

  const groupCounts = useMemo(() => {
    const base = {
      all: searched.length,
      labs: 0,
      research: 0,
      community: 0,
    };
    for (const item of searched) {
      base[groupIdForSource(item.source)] += 1;
    }
    return base;
  }, [searched]);

  const highImpact = items.filter((i) => i.tier === "High Impact").length;
  const cacheLabel = (() => {
    if (!meta?.fromCache) return meta ? "fresh crawl" : null;
    const age = meta.cacheAgeSec ?? 0;
    if (age < 60) return "cached · just now";
    if (age < 3600) return `cached · ${Math.round(age / 60)}m ago`;
    return `cached · ${Math.round(age / 3600)}h ago`;
  })();
  const personalLabel =
    user && prefs && prefs.sampleSize > 0
      ? ` · personalized (${prefs.sampleSize})`
      : "";
  const liveLabel = meta
    ? `${meta.liveCount} live · ${meta.enrichedCount} AI briefs${
        cacheLabel ? ` · ${cacheLabel}` : ""
      }${personalLabel}`
    : loading
      ? "loading live sources…"
      : error
        ? "live feed unavailable"
        : "live sources";

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setBriefOpen(true);
  };

  return (
    <AppShell
      title="AI Intelligence Feed"
      subtitle={`${items.length} updates · ${highImpact} high impact · ${liveLabel}`}
    >
      {error ? (
        <div className="border-b border-[var(--border)] bg-[rgba(255,80,80,0.08)] px-4 py-2 text-[12px] text-[var(--text-secondary)]">
          Live fetch issue: {error}. Showing available items.
        </div>
      ) : null}

      <div className="relative flex h-full min-h-0 flex-col">
        <FeedFilters
          value={filters}
          onChange={setFilters}
          resultCount={filtered.length}
          extra={
            <SourceGroupChips
              active={groupFilter}
              onChange={setGroupFilter}
              counts={groupCounts}
            />
          }
        />
        <div className="min-h-0 flex-1">
          <SourceBoard
            items={filtered}
            selectedId={selected?.id}
            onSelect={handleSelect}
            onRefresh={refresh}
            refreshing={loading}
            emptyMessage={
              loading
                ? "Loading live intelligence…"
                : "No updates match these filters."
            }
          />
        </div>

        {selected && briefOpen ? (
          <ImpactBriefDrawer
            item={selected}
            onClose={() => setBriefOpen(false)}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
