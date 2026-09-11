"use client";
import { useLanguage } from "@/context/LanguageContext";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { FeedFilters, defaultFilters, type FeedFiltersState } from "@/components/feed/FeedFilters";
import { ImpactBriefDrawer } from "@/components/feed/ImpactBriefDrawer";
import { SourceBoard, SourceGroupChips } from "@/components/feed/SourceBoard";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { useFeed } from "@/context/FeedContext";
import { useSeenPosts } from "@/context/useSeenPosts";
import { groupIdForItem, type SourceGroupId } from "@/lib/source-groups";
import { prioritizeUnread } from "@/lib/seen-posts";

export function FeedPage() {
  const { t, locale, localize } = useLanguage();
  const { items, loading, refreshing, error, meta, forceRefresh } = useFeed();
  const { markSeen, commitSeen, committed, ready } = useSeenPosts();
  const [filters, setFilters] = useState<FeedFiltersState>(defaultFilters);
  const [groupFilter, setGroupFilter] = useState<SourceGroupId | "all">("all");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);

  const pool = useMemo(
    () => (ready ? items.filter((item) => item.title.trim()) : []),
    [items, ready]
  );

  const openBrief = useCallback(
    (id: string) => {
      const item = items.find((entry) => entry.id === id);
      markSeen(item ?? { id, url: "" });
      setSelectedId(id);
      setBriefOpen(true);
    },
    [items, markSeen]
  );

  const onRefresh = useCallback(() => {
    commitSeen();
    forceRefresh();
  }, [commitSeen, forceRefresh]);

  useEffect(() => {
    if (selectedId && pool.some((item) => item.id === selectedId)) return;
    setBriefOpen(false);
    setSelectedId(pool[0]?.id ?? "");
  }, [pool, selectedId]);

  const searched = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((item) => {
      const hay = [item.title, item.summary, localize(item).title, localize(item).summary, item.source]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [filters.query, pool, localize]);

  const { items: filtered } = useMemo(() => {
    const matching = groupFilter === "all" ? searched : searched.filter(
      (item) => groupIdForItem(item) === groupFilter
    );
    return prioritizeUnread(matching, committed);
  }, [groupFilter, searched, committed]);

  const selected =
    filtered.find((item) => item.id === selectedId) ??
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
      base[groupIdForItem(item)] += 1;
    }
    return base;
  }, [searched]);

  return (
    <AppShell
      title={t("Feed")}
      subtitle={t("What matters in AI today")}
      actions={
        <Button
          variant="ghost"
          active={toolsOpen}
          aria-expanded={toolsOpen}
          aria-label={t(toolsOpen ? "Hide search and filters" : "Show search and filters")}
          onClick={() => setToolsOpen((open) => !open)}
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          {t(toolsOpen ? "Close" : "Search")}
        </Button>
      }
    >
      {error ? (
        <div className="border-b border-[var(--border)] bg-[rgba(255,80,80,0.08)] px-4 py-2 text-[12px] text-[var(--text-secondary)]">
          {locale === "zh" ? "动态更新失败，先显示已有内容。" : `Live fetch issue: ${error}. Showing available items.`}
        </div>
      ) : null}

      <div className="relative flex h-full min-h-0 flex-col">
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <SourceGroupChips
            active={groupFilter}
            onChange={setGroupFilter}
            counts={groupCounts}
          />
        </div>
        {toolsOpen ? (
          <FeedFilters
            value={filters}
            onChange={setFilters}
            resultCount={filtered.length}
          />
        ) : null}
        <div className="min-h-0 flex-1">
          <SourceBoard
            items={filtered}
            selectedId={selected?.id}
            onSelect={openBrief}
            onSeen={markSeen}
            onRefresh={onRefresh}
            refreshing={refreshing}
            loading={
              !ready ||
              loading ||
              Boolean(meta?.warming && filtered.length === 0)
            }
            emptyMessage={
              meta?.warming
                ? "Building the live feed…"
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
