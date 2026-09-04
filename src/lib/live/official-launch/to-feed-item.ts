import {
  assessBriefReadiness,
  recoverOfficialLaunchEvidence,
} from "@/lib/live/brief-readiness";
import { toFeedItem, tierFromScores } from "@/lib/live/normalize";
import type { EnrichmentFetchHtml } from "@/lib/live/official-launch/enrich";
import { publicReadUrl } from "@/lib/live/public-read-url";
import type {
  BriefReadiness,
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

function mapOfficialLaunchEvent(
  event: OfficialLaunchEvent,
  evidence: { summary: string; readiness: BriefReadiness }
): FeedItem {
  const scores: Scores = {
    impact: event.impactScore,
    relevance: event.qualificationScore,
    trend: Math.round(
      Math.min(100, event.noveltyScore * 0.7 + event.confidence * 100 * 0.3)
    ),
  };
  const primary = event.primarySource;
  const recoveredFull =
    evidence.readiness === "full" && evidence.summary !== primary.summary;
  const item = toFeedItem({
    id: event.eventId,
    title: event.title,
    originalTitle: primary.title,
    summary: evidence.summary,
    originalSummary: recoveredFull ? evidence.summary : primary.summary,
    source: event.organizationName,
    publishedAt: event.publishedAt,
    category: categoryFor(event),
    url: publicReadUrl(primary.url),
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
    briefReadiness: evidence.readiness,
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
          url: publicReadUrl(source.url),
          sourceType: source.sourceType,
        })),
    },
  };
}

/** Sync mapping used by existing tests. Assesses current evidence only; no fetch. */
export function officialLaunchEventToFeedItem(
  event: OfficialLaunchEvent
): FeedItem {
  const verdict = assessBriefReadiness({
    title: event.title,
    summary: event.summary,
    entities: event.entities,
  });
  return mapOfficialLaunchEvent(event, {
    summary: event.summary,
    readiness: verdict.readiness === "full" ? "full" : "factual-only",
  });
}

export function officialLaunchEventsToFeedItems(
  events: OfficialLaunchEvent[]
): FeedItem[] {
  return events.map(officialLaunchEventToFeedItem);
}

export async function officialLaunchEventToFeedItemReady(
  event: OfficialLaunchEvent,
  fetchHtml?: EnrichmentFetchHtml
): Promise<FeedItem> {
  const recovered = await recoverOfficialLaunchEvidence(event, fetchHtml);
  return mapOfficialLaunchEvent(event, {
    summary: recovered.summary,
    readiness: recovered.assessment.readiness,
  });
}

export async function officialLaunchEventsToFeedItemsReady(
  events: OfficialLaunchEvent[],
  fetchHtml?: EnrichmentFetchHtml
): Promise<FeedItem[]> {
  return Promise.all(
    events.map((event) => officialLaunchEventToFeedItemReady(event, fetchHtml))
  );
}
