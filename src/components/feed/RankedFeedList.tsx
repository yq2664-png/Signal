"use client";

import { PullToRefresh } from "@/components/feed/PullToRefresh";
import { FeedRow } from "@/components/feed/FeedItem";
import type { FeedItem, Insight } from "@/lib/types";
import { insightForItem } from "@/lib/surface/insight-link";

export function RankedFeedList({
  items,
  insights,
  selectedId,
  onSelect,
  onRefresh,
  refreshing = false,
  emptyMessage = "No updates match these filters.",
}: {
  items: FeedItem[];
  insights: Insight[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  emptyMessage?: string;
}) {
  const list =
    items.length === 0 ? (
      <div className="flex min-h-full items-center justify-center p-8">
        <p className="text-[13px] text-[var(--text-muted)]">{emptyMessage}</p>
      </div>
    ) : (
      <div className="min-h-full">
        {items.map((item, index) => (
          <FeedRow
            key={item.id}
            item={item}
            index={index}
            selected={selectedId === item.id}
            insight={insightForItem(item, insights)}
            onSelect={() => onSelect(item.id)}
          />
        ))}
      </div>
    );

  if (!onRefresh) {
    return <div className="h-full min-h-0 overflow-y-auto">{list}</div>;
  }

  return (
    <PullToRefresh
      className="h-full min-h-0"
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      {list}
    </PullToRefresh>
  );
}
