"use client";

import { clsx } from "clsx";
import { ExternalLink } from "lucide-react";
import { FlagBadCaseButton } from "@/components/feed/FlagBadCaseButton";
import { SafeImage } from "@/components/feed/SafeImage";
import { CategoryBadge, TierBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { FeedItem } from "@/lib/types";
import { formatRelative } from "@/lib/utils";

export function FeedRow({
  item,
  selected,
  onSelect,
  dense = false,
}: {
  item: FeedItem;
  selected?: boolean;
  onSelect?: () => void;
  dense?: boolean;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={clsx(
        "group w-full cursor-pointer border-b border-[var(--border)] text-left transition-colors duration-100",
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]",
        dense ? "px-4 py-3" : "px-5 py-4"
      )}
      style={{
        borderBottom: "1px solid var(--border)",
        transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <TierBadge tier={item.tier} />
            <CategoryBadge category={item.category} />
            <span className="text-[11px] text-[var(--text-muted)]">
              {item.source}
            </span>
            {item.native?.authorHandle || item.native?.authorName ? (
              <>
                <span className="text-[11px] text-[var(--text-muted)]">·</span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {item.native.authorHandle || item.native.authorName}
                </span>
              </>
            ) : null}
            <span className="text-[11px] text-[var(--text-muted)]">·</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {formatRelative(item.publishedAt)}
            </span>
          </div>

          <h2
            className={clsx(
              "font-medium tracking-[-0.015em] text-[var(--text-primary)]",
              dense ? "text-[14px] leading-5" : "text-[15px] leading-6"
            )}
          >
            {item.title}
          </h2>

          {!dense ? (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-[var(--text-secondary)]">
              {item.summary}
            </p>
          ) : null}
        </div>

        <SafeImage
          src={item.imageUrl}
          className={clsx(
            "mt-0.5 shrink-0 rounded-[6px] object-cover",
            dense ? "h-10 w-14" : "h-14 w-20"
          )}
        />
      </div>
    </article>
  );
}

export function ImpactBriefPanel({ item }: { item: FeedItem }) {
  const sections: {
    key: string;
    body: string;
    emphasize?: boolean;
  }[] = [
    { key: "What happened?", body: item.brief.whatHappened },
    { key: "Why it matters?", body: item.brief.whyItMatters },
    { key: "Potential impact", body: item.brief.potentialImpact },
    { key: "Key takeaway", body: item.brief.keyTakeaway, emphasize: true },
  ];

  return (
    <div className="fade-in flex h-full flex-col overflow-hidden">
      <div
        className="shrink-0 border-b border-[var(--border)] px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <TierBadge tier={item.tier} />
          <CategoryBadge category={item.category} />
        </div>
        <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.02em] text-[var(--text-primary)]">
          {item.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--text-muted)]">
          <span>{item.source}</span>
          <span>·</span>
          <span>{formatRelative(item.publishedAt)}</span>
          <span>·</span>
          <span>{item.readingTimeMin} min brief</span>
        </div>

        <SafeImage
          src={item.imageUrl}
          className="aspect-video w-full object-cover"
          wrapperClassName="mt-3 overflow-hidden rounded-[8px]"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            Open source
          </Button>
          <FlagBadCaseButton item={item} />
        </div>
        {item.originalTitle && item.originalTitle !== item.title ? (
          <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">
            Raw: {item.originalTitle}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="label mb-0">AI Impact Brief</div>
          {item.tags.includes("ai-brief") ? (
            <span className="rounded-[4px] bg-[rgba(247,156,224,0.12)] px-1.5 py-0.5 text-[10px] text-[var(--status-label)]">
              OpenAI
            </span>
          ) : (
            <span className="rounded-[4px] bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
              Template
            </span>
          )}
        </div>
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.key} className="slide-in">
              <h3
                className={clsx(
                  "mb-1.5 text-[13px] font-semibold",
                  section.emphasize
                    ? "text-[var(--status-label)]"
                    : "text-[var(--text-primary)]"
                )}
              >
                {section.key}
              </h3>
              <p
                className={clsx(
                  "text-[14px] leading-[22px]",
                  section.emphasize
                    ? "text-[var(--text-body)]"
                    : "text-[var(--text-secondary)]"
                )}
              >
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-[4px] bg-[var(--bg-overlay)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
