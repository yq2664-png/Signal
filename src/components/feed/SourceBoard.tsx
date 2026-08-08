"use client";

import { clsx } from "clsx";
import { Bookmark, Heart } from "lucide-react";
import { SafeImage } from "@/components/feed/SafeImage";
import { SourceLogo } from "@/components/feed/SourceLogo";
import { PullToRefresh } from "@/components/feed/PullToRefresh";
import { useBookmarks } from "@/context/BookmarksContext";
import { useLikes } from "@/context/LikesContext";
import type { FeedItem } from "@/lib/types";
import { sourceChrome } from "@/lib/source-chrome";
import { sourceGroups, type SourceGroupId } from "@/lib/source-groups";
import { formatRelative } from "@/lib/utils";

export function SourceGroupChips({
  active,
  onChange,
  counts,
}: {
  active: SourceGroupId | "all";
  onChange: (id: SourceGroupId | "all") => void;
  counts: Record<SourceGroupId | "all", number>;
}) {
  const chips: { id: SourceGroupId | "all"; label: string }[] = [
    { id: "all", label: "All Sources" },
    ...sourceGroups.map((g) => ({
      id: g.id as SourceGroupId | "all",
      label: g.label,
    })),
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.id)}
          className={clsx(
            "rounded-[4px] px-2 py-1 text-[11px] transition-colors duration-100",
            active === chip.id
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:text-[var(--text-body)]"
          )}
          style={{
            transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
        >
          {chip.label}
          <span className="mono ml-1.5 text-[10px] opacity-70">
            {counts[chip.id] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}

export function SourceBoard({
  items,
  selectedId,
  onSelect,
  onRefresh,
  refreshing = false,
  emptyMessage = "No updates in these sources.",
}: {
  items: FeedItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  emptyMessage?: string;
}) {
  const board =
    items.length === 0 ? (
      <div className="flex min-h-full items-center justify-center p-8">
        <p className="text-[13px] text-[var(--text-muted)]">{emptyMessage}</p>
      </div>
    ) : (
      <div className="relative min-h-full bg-[var(--bg)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 40% at 15% 0%, rgba(255,255,255,0.045), transparent 55%), radial-gradient(ellipse 50% 35% at 85% 20%, rgba(138,143,152,0.08), transparent 50%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(255,255,255,0.03), transparent 55%)",
          }}
        />
        <div className="relative px-4 py-4 md:px-5">
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
            {items.map((item) => (
              <BoardCard
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          </div>
        </div>
      </div>
    );

  if (!onRefresh) {
    return <div className="h-full min-h-0 overflow-y-auto">{board}</div>;
  }

  return (
    <PullToRefresh
      className="h-full min-h-0"
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      {board}
    </PullToRefresh>
  );
}

function BoardCard({
  item,
  selected,
  onSelect,
}: {
  item: FeedItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const chrome = sourceChrome[item.source];
  const kind = chrome.kind;
  const { isLiked, toggleLike, getLikes } = useLikes();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const liked = isLiked(item.id);
  const saved = isBookmarked(item.id);
  const likeCount = getLikes(item.id);

  return (
    <article
      className={clsx(
        "glass-card mb-4 break-inside-avoid overflow-hidden rounded-[12px] transition-colors duration-100",
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      )}
      style={{
        transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        boxShadow: selected ? `inset 3px 0 0 ${chrome.accent}` : undefined,
      }}
    >
      <header
        className="flex items-center gap-2 px-3.5 pt-3 pb-1.5"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <SourceLogo source={item.source} size={14} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
          {item.source}
        </span>
        <button
          type="button"
          aria-label={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
          onClick={(e) => {
            e.stopPropagation();
            toggleLike(item);
          }}
          className={clsx(
            "inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11px] transition-colors duration-100",
            liked
              ? "text-[var(--status-label)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-body)]"
          )}
          style={{
            transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
        >
          <Heart
            className="h-3.5 w-3.5"
            strokeWidth={1.75}
            fill={liked ? "currentColor" : "none"}
          />
          {likeCount > 0 ? (
            <span className="mono tabular-nums">{likeCount}</span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label={saved ? "Unsave" : "Save"}
          aria-pressed={saved}
          onClick={(e) => {
            e.stopPropagation();
            toggleBookmark(item);
          }}
          className={clsx(
            "inline-flex items-center rounded-[6px] px-1.5 py-1 text-[11px] transition-colors duration-100",
            saved
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-body)]"
          )}
          style={{
            transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
        >
          <Bookmark
            className="h-3.5 w-3.5"
            strokeWidth={1.75}
            fill={saved ? "currentColor" : "none"}
          />
        </button>
      </header>

      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className="w-full cursor-pointer px-3.5 pt-1 pb-3 text-left"
      >
        {kind === "tweet" ? (
          <TweetCard item={item} />
        ) : kind === "youtube" ? (
          <YouTubeCard item={item} accent={chrome.accent} />
        ) : kind === "paper" ? (
          <PaperCard item={item} accent={chrome.accent} />
        ) : kind === "forum" ? (
          <ForumCard item={item} accent={chrome.accent} />
        ) : kind === "repo" ? (
          <RepoCard item={item} />
        ) : kind === "press" || kind === "blog" ? (
          <NewsCard item={item} accent={chrome.accent} />
        ) : (
          <LabCard item={item} />
        )}
      </div>
    </article>
  );
}

function formatCount(n?: number): string {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function TweetCard({ item }: { item: FeedItem }) {
  const name = item.native?.authorName || "Unknown";
  const handle = item.native?.authorHandle || "@x";
  const replies = item.native?.replies ?? 0;
  const reposts = item.native?.reposts ?? 0;
  const likes = item.native?.likes ?? 0;

  return (
    <div className="mb-0 flex items-start gap-2.5">
      <SafeImage
        src={item.avatarUrl}
        className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
          <span className="font-semibold text-[var(--text-primary)]">{name}</span>
          <span className="text-[var(--text-muted)]">{handle}</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span className="text-[var(--text-muted)]">
            {formatRelative(item.publishedAt)}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-[20px] text-[var(--text-body)]">
          {item.summary || item.title}
        </p>
        <div className="mt-2.5 flex gap-5 text-[11px] text-[var(--text-muted)]">
          <span>💬 {formatCount(replies)}</span>
          <span>🔁 {formatCount(reposts)}</span>
          <span>♥ {formatCount(likes)}</span>
        </div>
      </div>
    </div>
  );
}

function NewsCard({
  item,
  accent,
}: {
  item: FeedItem;
  accent: string;
}) {
  return (
    <div>
      <SafeImage
        src={item.imageUrl}
        className="aspect-[16/9] w-full object-cover"
        wrapperClassName="mb-2.5 overflow-hidden rounded-[8px]"
      />
      <h3 className="text-[14px] leading-5 font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
        {item.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[12px] leading-[18px] text-[var(--text-secondary)]">
        {item.summary}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className="rounded-[4px] px-1.5 py-0.5 font-medium"
          style={{ background: `${accent}22`, color: accent }}
        >
          {item.native?.subtitle || item.source}
        </span>
        {item.native?.authorName ? (
          <span className="text-[var(--text-muted)]">{item.native.authorName}</span>
        ) : null}
        <span className="text-[var(--text-muted)]">
          {formatRelative(item.publishedAt)}
        </span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--text-muted)]">
          {item.readingTimeMin} min read
        </span>
      </div>
    </div>
  );
}

function LabCard({ item }: { item: FeedItem }) {
  return (
    <div>
      <SafeImage
        src={item.imageUrl}
        className="absolute inset-0 h-full w-full object-cover"
        wrapperClassName="relative mb-2.5 flex aspect-[16/9] items-end overflow-hidden rounded-[8px] p-2.5"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        {item.native?.subtitle ? (
          <div className="relative flex w-full items-center justify-end">
            <span className="truncate text-[10px] text-white/80">
              {item.native.subtitle}
            </span>
          </div>
        ) : null}
      </SafeImage>
      <h3 className="text-[14px] leading-5 font-semibold text-[var(--text-primary)]">
        {item.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-[var(--text-secondary)]">
        {item.summary}
      </p>
      <div className="mt-2 text-[11px] text-[var(--text-muted)]">
        {item.source} · {formatRelative(item.publishedAt)}
      </div>
    </div>
  );
}

function YouTubeCard({
  item,
  accent,
}: {
  item: FeedItem;
  accent: string;
}) {
  const channel =
    item.native?.authorName ||
    item.native?.subtitle ||
    item.summary.split(":")[0]?.trim() ||
    "YouTube";
  const duration = item.native?.durationLabel;
  const views = item.native?.views;

  return (
    <div>
      <SafeImage
        src={item.imageUrl}
        className="h-full w-full object-cover"
        wrapperClassName="relative mb-2 aspect-video overflow-hidden rounded-[8px]"
      >
        <span
          className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[13px] text-white"
          style={{ background: accent, boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}
        >
          ▶
        </span>
        {duration ? (
          <span className="absolute right-1.5 bottom-1.5 rounded-[3px] bg-black/80 px-1 py-0.5 mono text-[9px] text-white">
            {duration}
          </span>
        ) : null}
      </SafeImage>
      <h3 className="line-clamp-2 text-[13px] leading-5 font-medium text-[var(--text-primary)]">
        {item.title}
      </h3>
      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
        {channel}
        {views != null ? ` · ${formatCount(views)} views` : null}
        {duration && !item.imageUrl ? ` · ${duration}` : null}
        {" · "}
        {formatRelative(item.publishedAt)}
      </div>
    </div>
  );
}

function PaperCard({
  item,
  accent,
}: {
  item: FeedItem;
  accent: string;
}) {
  const category = item.native?.subtitle || "cs.AI";
  return (
    <div>
      <SafeImage
        src={item.imageUrl}
        className="aspect-[16/9] w-full object-cover"
        wrapperClassName="mb-2 overflow-hidden rounded-[8px]"
      />
      <h3 className="text-[13px] leading-5 font-semibold text-[var(--text-primary)]">
        {item.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-secondary)]">
        {item.summary}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
        <span
          className="rounded-[4px] px-1.5 py-0.5 font-medium"
          style={{ background: `${accent}22`, color: accent }}
        >
          {category}
        </span>
        {item.native?.authorName ? (
          <span>{item.native.authorName.split(",")[0]}</span>
        ) : null}
        <span>{formatRelative(item.publishedAt)}</span>
      </div>
    </div>
  );
}

function ForumCard({
  item,
  accent,
}: {
  item: FeedItem;
  accent: string;
}) {
  const points = item.native?.points;
  const comments = item.native?.comments;
  return (
    <div className="flex gap-2.5">
      {points != null ? (
        <div
          className="mono pt-0.5 text-[13px] font-semibold tabular-nums"
          style={{ color: accent }}
        >
          {points}
        </div>
      ) : null}
      <div className="min-w-0">
        <h3 className="text-[13px] leading-5 font-medium text-[var(--text-primary)]">
          {item.title}
        </h3>
        {item.summary ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-secondary)]">
            {item.summary}
          </p>
        ) : null}
        <div className="mt-1 text-[11px] text-[var(--text-muted)]">
          {item.native?.authorName ? `${item.native.authorName} · ` : null}
          {comments != null ? `${comments} comments · ` : null}
          {formatRelative(item.publishedAt)}
        </div>
      </div>
    </div>
  );
}

function RepoCard({ item }: { item: FeedItem }) {
  const stars = item.native?.stars;
  const forks = item.native?.forks;
  const lang = item.native?.subtitle;

  return (
    <div className="flex gap-2.5">
      <SafeImage
        src={item.avatarUrl}
        className="mt-0.5 h-8 w-8 shrink-0 rounded-[6px] object-cover"
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] leading-5 font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          {item.title}
        </h3>
        {item.native?.repoName ? (
          <p className="mono mt-0.5 text-[11px] text-[var(--text-muted)]">
            {item.native.repoName}
          </p>
        ) : null}
        <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-[var(--text-secondary)]">
          {item.summary}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
          {stars != null ? (
            <span className="mono">★ {formatCount(stars)}</span>
          ) : null}
          {forks != null ? (
            <span className="mono">⑂ {formatCount(forks)}</span>
          ) : null}
          {lang ? <span>{lang}</span> : null}
          <span>{formatRelative(item.publishedAt)}</span>
        </div>
      </div>
    </div>
  );
}
