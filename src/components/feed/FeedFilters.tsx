"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";

export type SortMode = "ranked" | "newest" | "impact" | "trend";

export interface FeedFiltersState {
  query: string;
  sort: SortMode;
}

export const defaultFilters: FeedFiltersState = {
  query: "",
  sort: "ranked",
};

export function FeedFilters({
  value,
  onChange,
  resultCount,
  extra,
}: {
  value: FeedFiltersState;
  onChange: (next: FeedFiltersState) => void;
  resultCount: number;
  extra?: ReactNode;
}) {
  return (
    <div
      className="shrink-0 space-y-3 border-b border-[var(--border)] px-4 py-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            strokeWidth={1.75}
          />
          <input
            value={value.query}
            onChange={(e) => onChange({ ...value, query: e.target.value })}
            placeholder="Search…"
            className="h-8 w-full rounded-[6px] bg-[var(--bg-overlay)] pr-3 pl-8 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:shadow-[var(--inset-border)]"
          />
        </div>
        <div className="mono hidden text-[11px] text-[var(--text-muted)] sm:block">
          {resultCount} items
        </div>
      </div>

      {extra ? <div>{extra}</div> : null}
    </div>
  );
}
