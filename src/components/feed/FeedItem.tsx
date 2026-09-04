"use client";

import { clsx } from "clsx";
import { Bookmark, ExternalLink, Heart } from "lucide-react";
import { FlagBadCaseButton } from "@/components/feed/FlagBadCaseButton";
import { SourceLogo } from "@/components/feed/SourceLogo";
import { Button } from "@/components/ui/Button";
import { ValueCueBadge } from "@/components/ui/Badge";
import { useBookmarks } from "@/context/BookmarksContext";
import { useLikes } from "@/context/LikesContext";
import type { FeedItem } from "@/lib/types";
import { isBriefEligible } from "@/lib/live/normalize";
import { presentBrief } from "@/lib/surface/present-brief";
import { formatRelative } from "@/lib/utils";

export function FeedRow({
  item,
  index,
  selected,
  onSelect,
}: {
  item: FeedItem;
  index: number;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const rank = String(index + 1).padStart(2, "0");

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      className={clsx(
        "group w-full cursor-pointer border-b border-[var(--border)] px-5 py-3.5 text-left transition-colors duration-100",
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      )}
      style={{
        borderBottom: "1px solid var(--border)",
        transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mono mt-0.5 w-6 shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.valueCue ? <ValueCueBadge cue={item.valueCue} /> : null}
            <span className="truncate text-[11px] text-[var(--text-muted)]">
              {item.source}
            </span>
            {formatRelative(item.publishedAt) ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                {formatRelative(item.publishedAt)}
              </span>
            ) : null}
          </div>
          <h2 className="text-[15px] leading-6 font-medium tracking-[-0.015em] text-[var(--text-primary)]">
            {item.title}
          </h2>
          {item.summary ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[var(--text-secondary)]">
              {item.summary}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

const BRIEF_SECTIONS: Array<{
  key: keyof ReturnType<typeof presentBrief>;
  label: string;
  hint: string;
  emphasize?: boolean;
}> = [
  { key: "whatHappened", label: "What happened", hint: "Facts only" },
  { key: "whyItMatters", label: "Why it matters", hint: "Why this matters now" },
  {
    key: "potentialImpact",
    label: "Potential impact",
    hint: "What might change",
  },
  {
    key: "keyTakeaway",
    label: "Key takeaway",
    hint: "One thing to remember",
    emphasize: true,
  },
];

export function ImpactBriefPanel({
  item,
}: {
  item: FeedItem;
}) {
  const showBrief = isBriefEligible(item);
  const brief = presentBrief(item.brief);
  const sections = showBrief
    ? BRIEF_SECTIONS.filter((section) => brief[section.key])
    : [];
  const sourceText = item.originalSummary || item.summary;
  const { isLiked, toggleLike } = useLikes();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const liked = isLiked(item.id);
  const saved = isBookmarked(item.id);

  return (
    <div className="fade-in flex h-full flex-col overflow-hidden">
      <div
        className="shrink-0 border-b border-[var(--border)] px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {item.valueCue ? <ValueCueBadge cue={item.valueCue} /> : null}
        </div>
        <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.02em] text-[var(--text-primary)]">
          {item.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--text-muted)]">
          <SourceLogo source={item.source} size={12} />
          <span>{item.source}</span>
          {formatRelative(item.publishedAt) ? (
            <>
              <span>·</span>
              <span>{formatRelative(item.publishedAt)}</span>
            </>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            Read original
          </Button>
          <Button
            variant="subtle"
            aria-pressed={liked}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleLike(item);
            }}
          >
            <Heart
              className="h-3.5 w-3.5"
              strokeWidth={1.75}
              fill={liked ? "currentColor" : "none"}
            />
            {liked ? "Liked" : "Like"}
          </Button>
          <Button
            variant="subtle"
            aria-pressed={saved}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleBookmark(item);
            }}
          >
            <Bookmark
              className="h-3.5 w-3.5"
              strokeWidth={1.75}
              fill={saved ? "currentColor" : "none"}
            />
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {showBrief ? (
          <>
            <div className="label mb-4">Impact Brief</div>
            <div className="space-y-5">
              {sections.map((section) => (
                <section key={section.key} className="slide-in">
                  <h3
                    className={clsx(
                      "mb-0.5 text-[13px] font-semibold",
                      section.emphasize
                        ? "text-[var(--status-label)]"
                        : "text-[var(--text-primary)]"
                    )}
                  >
                    {section.label}
                  </h3>
                  <p className="mb-1.5 text-[11px] text-[var(--text-muted)]">
                    {section.hint}
                  </p>
                  <p
                    className={clsx(
                      "text-[14px] leading-[22px]",
                      section.emphasize
                        ? "text-[var(--text-body)]"
                        : "text-[var(--text-secondary)]"
                    )}
                  >
                    {brief[section.key]}
                  </p>
                </section>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="label mb-4">Source</div>
            {sourceText ? (
              <p className="text-[14px] leading-[22px] text-[var(--text-secondary)]">
                {sourceText}
              </p>
            ) : null}
            <p className="mt-4 text-[12px] leading-5 text-[var(--text-muted)]">
              Not enough source evidence for an Impact Brief. Read the original post.
            </p>
          </>
        )}
        <div className="mt-8">
          <FlagBadCaseButton item={item} quiet />
        </div>
      </div>
    </div>
  );
}

