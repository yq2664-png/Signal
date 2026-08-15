import { toFeedItem, tierFromScores } from "@/lib/live/normalize";
import type {
  Category,
  FeedItem,
  OfficialLaunchEvent,
  Scores,
} from "@/lib/types";

function categoryFor(event: OfficialLaunchEvent): Category {
  if (
    event.eventType === "model-release" ||
    event.eventType === "open-source-release"
  ) {
    return "Model Releases";
  }
  return event.eventType === "api-release" ? "Tools" : "AI Products";
}

export function officialLaunchEventToFeedItem(
  event: OfficialLaunchEvent
): FeedItem {
  const scores: Scores = {
    impact: event.impactScore,
    relevance: event.qualificationScore,
    trend: Math.round(
      Math.min(100, event.noveltyScore * 0.7 + event.confidence * 100 * 0.3)
    ),
  };
  const primary = event.primarySource;
  const item = toFeedItem({
    id: event.eventId,
    title: event.title,
    originalTitle: primary.title,
    summary: event.summary,
    originalSummary: primary.summary,
    source: event.organizationName,
    publishedAt: event.publishedAt,
    category: categoryFor(event),
    url: primary.url,
    imageUrl: primary.imageUrl,
    tags: [
      "live",
      "official-launch",
      event.tier,
      event.eventType,
      event.organizationId,
    ],
    native: {
      authorName: primary.author,
      subtitle:
        event.sources.length > 1
          ? `${event.sources.length} official sources`
          : `${event.organizationName} · Official`,
    },
  });

  return {
    ...item,
    scores,
    tier: tierFromScores(scores),
    officialLaunch: {
      eventId: event.eventId,
      eventType: event.eventType,
      product: event.entities.product,
      model: event.entities.model,
      version: event.entities.version,
      supportingSources: event.sources
        .filter(
          (source) =>
            source.canonicalUrl !== event.primarySource.canonicalUrl
        )
        .map((source) => ({
          title: source.title,
          url: source.url,
          sourceType: source.sourceType,
        })),
    },
  };
}

export function officialLaunchEventsToFeedItems(
  events: OfficialLaunchEvent[]
): FeedItem[] {
  return events.map(officialLaunchEventToFeedItem);
}
