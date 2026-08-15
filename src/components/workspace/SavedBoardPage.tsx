"use client";

import { useEffect, useMemo, useState } from "react";
import { ImpactBriefDrawer } from "@/components/feed/ImpactBriefDrawer";
import { SourceBoard } from "@/components/feed/SourceBoard";
import { AppShell } from "@/components/layout/AppShell";
import { useFeed } from "@/context/FeedContext";
import type { FeedItem } from "@/lib/types";

export function SavedBoardPage({
  title,
  subtitle,
  items,
  ready,
  emptyMessage,
  emptyAction,
}: {
  title: string;
  subtitle: string;
  items: FeedItem[];
  ready: boolean;
  emptyMessage: string;
  emptyAction?: { label: string; onClick: () => void };
}) {
  const { items: liveItems } = useFeed();
  const [selectedId, setSelectedId] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);

  const resolved = useMemo(() => {
    const liveById = new Map(liveItems.map((item) => [item.id, item]));
    return items.map((item) => liveById.get(item.id) ?? item);
  }, [items, liveItems]);

  useEffect(() => {
    if (!selectedId && resolved[0]) setSelectedId(resolved[0].id);
  }, [resolved, selectedId]);

  const selected =
    resolved.find((item) => item.id === selectedId) ?? resolved[0] ?? null;

  const showEmptyAction =
    ready && resolved.length === 0 && Boolean(emptyAction);

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      actions={
        showEmptyAction && emptyAction ? (
          <button
            type="button"
            onClick={emptyAction.onClick}
            className="rounded-[6px] bg-[var(--cta)] px-3 py-1.5 text-[12px] font-semibold text-[var(--cta-text)]"
          >
            {emptyAction.label}
          </button>
        ) : null
      }
    >
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <SourceBoard
            items={resolved}
            selectedId={selected?.id}
            onSelect={(id) => {
              setSelectedId(id);
              setBriefOpen(true);
            }}
            emptyMessage={ready ? emptyMessage : "Loading…"}
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
