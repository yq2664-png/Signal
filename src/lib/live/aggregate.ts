import { enrichFeedItems } from "@/lib/live/openai-enrich";
import { fetchDeveloperCommunityFeedItems } from "@/lib/live/developer-community";
import { fetchOfficialLaunchFeedItems } from "@/lib/live/official-launch";
import { fetchResearchPaperFeedItems } from "@/lib/live/research-paper";
import { buildInsightsFromLiveSources } from "@/lib/live/insights";
import { fetchAllRss } from "@/lib/live/rss";
import { fetchX } from "@/lib/live/x";
import { fetchGitHubAll } from "@/lib/live/github";
import { fetchYouTube } from "@/lib/live/youtube";
import {
  buildRankingReport,
  persistRankingReport,
  rankUnifiedFeed,
} from "@/lib/live/ranking";
import { attachValueCues } from "@/lib/surface/value-cue";
import type { CommunitySignal, FeedItem, Insight } from "@/lib/types";
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
  insights?: Insight[];
  meta: FeedMeta;
};

/** Live-only aggregation — every source has a real connector */
export async function getAggregatedFeed(): Promise<FeedPayload> {
  const errors: string[] = [];
  const liveBatches = await Promise.allSettled([
    fetchOfficialLaunchFeedItems(),
    fetchResearchPaperFeedItems(),
    fetchDeveloperCommunityFeedItems(),
    fetchAllRss(),
    fetchYouTube(8),
    fetchX(10),
    fetchGitHubAll(),
  ]);

  const live: FeedItem[] = [];
  let communitySignals: CommunitySignal[] = [];
  const labels = [
    "Official Launch",
    "Research Paper",
    "Developer Community",
    "RSS",
    "YouTube",
    "X",
    "GitHub",
  ];
  liveBatches.forEach((result, i) => {
    if (result.status === "fulfilled") {
      if (i === 0) {
        const officialLaunch = result.value as Awaited<
          ReturnType<typeof fetchOfficialLaunchFeedItems>
        >;
        live.push(...officialLaunch.data);
        errors.push(...officialLaunch.errors.map((error) => `Official Launch: ${error}`));
      } else if (i === 1) {
        const researchPaper = result.value as Awaited<
          ReturnType<typeof fetchResearchPaperFeedItems>
        >;
        live.push(...researchPaper.data);
        errors.push(
          ...researchPaper.errors.map((error) => `Research Paper: ${error}`)
        );
      } else if (i === 2) {
        const developerCommunity = result.value as Awaited<
          ReturnType<typeof fetchDeveloperCommunityFeedItems>
        >;
        live.push(...developerCommunity.data);
        communitySignals = developerCommunity.signals ?? [];
        errors.push(
          ...developerCommunity.errors.map(
            (error) => `Developer Community: ${error}`
          )
        );
      } else {
        live.push(...(result.value as FeedItem[]));
      }
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

  const ranked = rankUnifiedFeed([...byId.values()]);
  const report = buildRankingReport(ranked);
  await persistRankingReport(report).catch(() => undefined);

  const insights = await buildInsightsFromLiveSources({
    feedItems: live,
    communitySignals,
    persist: true,
  });

  return {
    items: attachValueCues(ranked),
    insights: insights.published,
    meta: {
      liveCount: live.length,
      enrichedCount: enrichment.enrichedCount,
      enrichCacheHits: enrichment.cacheHits,
      fetchedAt: new Date().toISOString(),
      errors,
    },
  };
}
