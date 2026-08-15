"use client";

import { X } from "lucide-react";
import { ImpactBriefPanel } from "@/components/feed/FeedItem";
import { Button } from "@/components/ui/Button";
import type { FeedItem, Insight } from "@/lib/types";

export function ImpactBriefDrawer({
  item,
  insight,
  onClose,
}: {
  item: FeedItem;
  insight?: Insight;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <button
        type="button"
        aria-label="Close brief backdrop"
        className="pointer-events-auto absolute inset-0 bg-black/40 lg:bg-black/25"
        onClick={onClose}
      />
      <aside
        className="pointer-events-auto absolute top-0 right-0 bottom-0 z-20 flex w-full max-w-[440px] flex-col bg-[var(--bg-elevated)]"
        style={{ boxShadow: "var(--inset-border)" }}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="label mb-0">Impact Brief</span>
          <Button variant="icon" aria-label="Close brief" onClick={onClose}>
            <X className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ImpactBriefPanel item={item} insight={insight} />
        </div>
      </aside>
    </div>
  );
}
