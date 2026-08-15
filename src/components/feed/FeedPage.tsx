"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { FeedFilters, defaultFilters, type FeedFiltersState } from "@/components/feed/FeedFilters";
import { ImpactBriefDrawer } from "@/components/feed/ImpactBriefDrawer";
import { RankedFeedList } from "@/components/feed/RankedFeedList";
import { SourceGroupChips } from "@/components/feed/SourceBoard";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { useFeed } from "@/context/FeedContext";
import { insightForItem } from "@/lib/surface/insight-link";
import { groupIdForSource, type SourceGroupId } from "@/lib/source-groups";

export function FeedPage() {
  const { items, insights, loading, error, refresh } = useFeed();
  const [filters, setFilters] = useState<FeedFiltersState>(defaultFilters);
  const [groupFilter, setGroupFilter] = useState<SourceGroupId | "all">("all");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);

  useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const searched = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [item.title, item.summary, item.source]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [filters.query, items]);

  const filtered = useMemo(() => {
    if (groupFilter === "all") return searched;
    return searched.filter(
      (item) => groupIdForSource(item.source) === groupFilter
    );
  }, [groupFilter, searched]);

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

  return (
    <AppShell
      title="Feed"
      subtitle="What matters in AI today"
      actions={
        <Button
          variant="ghost"
          active={toolsOpen}
          aria-expanded={toolsOpen}
          aria-label={toolsOpen ? "Hide search and filters" : "Show search and filters"}
          onClick={() => setToolsOpen((open) => !open)}
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          {toolsOpen ? "Close" : "Search"}
        </Button>
      }
    >
      {error ? (
        <div className="border-b border-[var(--border)] bg-[rgba(255,80,80,0.08)] px-4 py-2 text-[12px] text-[var(--text-secondary)]">
          Live fetch issue: {error}. Showing available items.
        </div>
      ) : null}

      <div className="relative flex h-full min-h-0 flex-col">
        {toolsOpen ? (
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
        ) : null}
        <div className="min-h-0 flex-1">
          <RankedFeedList
            items={filtered}
            insights={insights}
            selectedId={selected?.id}
            onSelect={(id) => {
              setSelectedId(id);
              setBriefOpen(true);
            }}
            onRefresh={refresh}
            refreshing={loading}
            emptyMessage={
              loading
                ? "Loading…"
                : "No updates match these filters."
            }
          />
        </div>

        {selected && briefOpen ? (
          <ImpactBriefDrawer
            item={selected}
            insight={insightForItem(selected, insights)}
            onClose={() => setBriefOpen(false)}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
