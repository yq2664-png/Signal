import { makeCommunityBrief } from "@/lib/live/developer-community/brief";
import { slugId, toFeedItem } from "@/lib/live/normalize";
import type { CommunitySignal, FeedItem } from "@/lib/types";

export function communitySignalToFeedItem(signal: CommunitySignal): FeedItem {
  const primary = signal.evidence[0];
  const windowDays = Math.max(
    1,
    Math.round(
      (new Date(signal.lastSeenAt).getTime() -
        new Date(signal.firstSeenAt).getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );
  const implication =
    signal.summary +
    ` · ${signal.evidence.length} evidence · ${windowDays}d`;
  const item = toFeedItem({
    id: slugId("dc", signal.signalId),
    title: signal.summary,
    originalTitle: signal.summary,
    summary: implication,
    originalSummary: signal.evidence
      .map((row) => row.title)
      .slice(0, 3)
      .join(" · "),
    source: "Developer Community",
    publishedAt: signal.lastSeenAt,
    category: "Industry Trends",
    url: primary?.sourceUrl || "",
    tags: [
      "live",
      "developer-community",
      signal.signalType.toLowerCase().replaceAll("_", "-"),
      `evidence:${signal.evidence.length}`,
      ...signal.products.slice(0, 3),
    ],
    native: {
      subtitle: `${signal.signalType} · ${signal.evidence.length} evidence · ${windowDays}d`,
      comments: signal.evidence.length,
      authorName: signal.products.join(", ") || undefined,
    },
  });
  return {
    ...item,
    brief: makeCommunityBrief(signal),
  };
}

export function communitySignalsToFeedItems(
  signals: CommunitySignal[]
): FeedItem[] {
  return signals
    .filter((signal) => signal.status === "PUBLISH")
    .map(communitySignalToFeedItem);
}
