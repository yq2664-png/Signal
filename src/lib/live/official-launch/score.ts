import type { OfficialLaunchEvent } from "@/lib/types";
import type { OfficialLaunchOrganizationConfig } from "@/lib/live/official-launch/config";
import type { OfficialLaunchDiagnosticsCollector } from "@/lib/live/official-launch/diagnostics";

export function meetsPublicationThreshold(
  event: OfficialLaunchEvent,
  organization: OfficialLaunchOrganizationConfig
): boolean {
  const thresholds = organization.publishThresholds;
  return (
    event.qualificationScore >= thresholds.qualification &&
    event.noveltyScore >= thresholds.novelty &&
    event.impactScore >= thresholds.impact &&
    event.confidence >= 0.7
  );
}

export function selectPublishableEvents(
  events: OfficialLaunchEvent[],
  organizations: OfficialLaunchOrganizationConfig[],
  diagnostics?: OfficialLaunchDiagnosticsCollector
): OfficialLaunchEvent[] {
  return events
    .filter((event) => {
      const organization = organizations.find(
        (candidate) => candidate.organizationId === event.organizationId
      );
      if (!organization) return false;
      const accepted = meetsPublicationThreshold(event, organization);
      diagnostics?.record({
        candidateId: event.eventId,
        organizationId: event.organizationId,
        channelId: event.primarySource.channelId,
        title: event.title,
        url: event.primarySource.url,
        stage: "score",
        status: accepted ? "accepted" : "rejected",
        reason: accepted ? undefined : "below-tier-threshold",
        method: "deterministic",
        scores: {
          qualification: event.qualificationScore,
          novelty: event.noveltyScore,
          impact: event.impactScore,
          confidence: event.confidence,
        },
        thresholds: {
          ...organization.publishThresholds,
          confidence: 0.7,
        },
      });
      return accepted;
    })
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
        b.impactScore - a.impactScore
    );
}
