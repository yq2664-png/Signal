"use client";

import { useEffect, useMemo, useState } from "react";
import { FeedRow, ImpactBriefPanel } from "@/components/feed/FeedItem";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { useFeed } from "@/context/FeedContext";
import type { RankTier } from "@/lib/types";
import { sortFeed } from "@/lib/utils";

const insightTiers: RankTier[] = ["High Impact", "Trending"];

export function InsightsPage() {
  const { items, loading } = useFeed();

  const insights = useMemo(
    () =>
      sortFeed(
        items.filter((item) => insightTiers.includes(item.tier)),
        "ranked"
      ),
    [items]
  );

  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!selectedId && insights[0]) setSelectedId(insights[0].id);
  }, [insights, selectedId]);

  const selected =
    insights.find((item) => item.id === selectedId) ?? insights[0] ?? null;

  return (
    <AppShell
      title="Insights"
      subtitle="High-signal Impact Briefs — what happened, why it matters, what to do"
      actions={
        <Button variant="subtle" disabled>
          Role perspectives · soon
        </Button>
      }
    >
      <div className="flex h-full min-h-0">
        <section
          className="flex w-full min-w-0 flex-col border-r border-[var(--border)] md:w-[40%]"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div
            className="shrink-0 border-b border-[var(--border)] px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="label mb-1">Smart ranking queue</div>
            <p className="body-sm">
              Showing High Impact & Trending only
              {loading ? " · refreshing live sources…" : ""}. Emerging items stay
              in Feed until scores rise.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {insights.map((item) => (
              <FeedRow
                key={item.id}
                item={item}
                dense
                selected={selected?.id === item.id}
                onSelect={() => setSelectedId(item.id)}
              />
            ))}
          </div>
        </section>

        <section className="hidden min-w-0 flex-1 bg-[var(--bg-elevated)] md:block">
          {selected ? (
            <ImpactBriefPanel item={selected} />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-[13px] text-[var(--text-muted)]">
                {loading ? "Loading…" : "No insights available."}
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
