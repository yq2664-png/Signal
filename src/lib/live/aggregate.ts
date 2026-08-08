import { fetchArxiv } from "@/lib/live/arxiv";
import { enrichFeedItems } from "@/lib/live/openai-enrich";
import { fetchHackerNews } from "@/lib/live/hackernews";
import { fetchAllRss } from "@/lib/live/rss";
import { fetchX } from "@/lib/live/x";
import { fetchGitHubAll } from "@/lib/live/github";
import { fetchYouTube } from "@/lib/live/youtube";
import type { FeedItem } from "@/lib/types";
import { sortFeed } from "@/lib/utils";

export type FeedMeta = {
  liveCount: number;
  enrichedCount: number;
  enrichCacheHits: number;
  fetchedAt: string;
  errors: string[];
  /** True when served from the 30m snapshot cache */
  fromCache?: boolean;
  /** Seconds since the snapshot was built */
  cacheAgeSec?: number;
  /** Snapshot TTL in seconds */
  ttlSec?: number;
};

export type FeedPayload = {
  items: FeedItem[];
  meta: FeedMeta;
};

/** Live-only aggregation — every source has a real connector */
export async function getAggregatedFeed(): Promise<FeedPayload> {
  const errors: string[] = [];
  const liveBatches = await Promise.allSettled([
    fetchArxiv(12),
    fetchHackerNews(10),
    fetchAllRss(),
    fetchYouTube(8),
    fetchX(10),
    fetchGitHubAll(),
  ]);

  const live: FeedItem[] = [];
  const labels = ["arXiv", "Hacker News", "RSS", "YouTube", "X", "GitHub"];
  liveBatches.forEach((result, i) => {
    if (result.status === "fulfilled") {
      live.push(...result.value);
    } else {
      errors.push(`${labels[i]}: ${String(result.reason)}`);
      console.error(result.reason);
    }
  });

  const enrichment = await enrichFeedItems(sortFeed(live, "ranked"));
  if (enrichment.error) {
    errors.push(`OpenAI enrich: ${enrichment.error}`);
  }

  const byId = new Map<string, FeedItem>();
  for (const item of enrichment.items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  const items = sortFeed([...byId.values()], "ranked");

  return {
    items,
    meta: {
      liveCount: live.length,
      enrichedCount: enrichment.enrichedCount,
      enrichCacheHits: enrichment.cacheHits,
      fetchedAt: new Date().toISOString(),
      errors,
    },
  };
}
