import { CONFIDENCE_RANK } from "@/lib/live/insights/config";
import { clusterEvidence, type EvidenceCluster } from "@/lib/live/insights/cluster";
import {
  collectQualifiedEvidence,
  loadCappedPassPapers,
  type EvidenceInput,
  type QualifiedEvidence,
} from "@/lib/live/insights/evidence";
import {
  persistInsightsReport,
  type InsightsRunReport,
} from "@/lib/live/insights/diagnostics";
import {
  independentKeys,
  rolesOf,
  routeCluster,
} from "@/lib/live/insights/route";
import { synthesizeInsight } from "@/lib/live/insights/synthesize";
import type { CommunitySignal, FeedItem, Insight } from "@/lib/types";

export type InsightsBuildResult = {
  published: Insight[];
  report: InsightsRunReport;
  evidence: QualifiedEvidence[];
  clusters: EvidenceCluster[];
};

function sortPublished(insights: Insight[]): Insight[] {
  return [...insights].sort((left, right) => {
    const updated = right.lastUpdatedAt.localeCompare(left.lastUpdatedAt);
    if (updated !== 0) return updated;
    return CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
  });
}

export function buildInsights(
  input: EvidenceInput & { persist?: boolean }
): InsightsBuildResult {
  const now = input.now ?? new Date();
  const evidence = collectQualifiedEvidence({ ...input, now });
  const clusters = clusterEvidence(evidence);
  const published: Insight[] = [];
  const groundingViolations: string[] = [];
  const clusterRows: InsightsRunReport["clusters"] = [];
  const counts = { PUBLISH: 0, WATCH: 0, NOT_INSIGHT: 0 };

  if (evidence.length > 0 && clusters.length === 0) {
    counts.NOT_INSIGHT += 1;
    clusterRows.push({
      id: "unclustered",
      status: "NOT_INSIGHT",
      reason: "no-shared-change",
      roles: rolesOf(evidence),
      independentCount: independentKeys(evidence).length,
      evidenceCount: evidence.length,
      contradiction: false,
      freshness: "CURRENT",
    });
  }

  const publishedIds = new Set<string>();

  for (const cluster of clusters) {
    const routed = routeCluster(cluster, now);
    let status = routed.status;
    let reason = routed.reason;
    if (
      status === "PUBLISH" &&
      cluster.id === "persistent-memory" &&
      publishedIds.has("session-memory")
    ) {
      status = "NOT_INSIGHT";
      reason = "overlap";
    }
    counts[status] += 1;
    clusterRows.push({
      id: cluster.id,
      status,
      reason,
      roles: rolesOf(cluster.members),
      independentCount: independentKeys(cluster.members).length,
      evidenceCount: cluster.members.length,
      contradiction: routed.contradictionReady,
      freshness: routed.freshness,
    });
    if (status !== "PUBLISH") continue;
    const synthesized = synthesizeInsight({
      cluster,
      contradiction: routed.contradictionReady,
      confidence: routed.confidence,
      freshness: routed.freshness,
      now,
    });
    if (!synthesized) {
      counts.PUBLISH -= 1;
      counts.NOT_INSIGHT += 1;
      clusterRows[clusterRows.length - 1] = {
        ...clusterRows[clusterRows.length - 1],
        status: "NOT_INSIGHT",
        reason: "ungrounded-thesis",
      };
      continue;
    }
    if (synthesized.groundingViolations.length > 0) {
      groundingViolations.push(
        ...synthesized.groundingViolations.map(
          (name) => `${cluster.id}:${name}`
        )
      );
      counts.PUBLISH -= 1;
      counts.NOT_INSIGHT += 1;
      continue;
    }
    publishedIds.add(cluster.id);
    published.push(synthesized.insight);
  }

  const report: InsightsRunReport = {
    completedAt: now.toISOString(),
    windowDays: 21,
    evidenceByRole: {
      SUPPLY: evidence.filter((item) => item.role === "SUPPLY").length,
      CAPABILITY: evidence.filter((item) => item.role === "CAPABILITY").length,
      ADOPTION: evidence.filter((item) => item.role === "ADOPTION").length,
    },
    evidenceCount: evidence.length,
    clusters: clusterRows,
    counts,
    published: sortPublished(published),
    groundingViolations,
    frozenPipelinesUntouched: true,
  };

  return {
    published: report.published,
    report,
    evidence,
    clusters,
  };
}

export async function buildInsightsFromLiveSources(input: {
  feedItems: FeedItem[];
  communitySignals?: CommunitySignal[];
  now?: Date;
  persist?: boolean;
}): Promise<InsightsBuildResult> {
  const cappedPassPapers = await loadCappedPassPapers(input.now);
  const result = buildInsights({
    feedItems: input.feedItems,
    communitySignals: input.communitySignals,
    cappedPassPapers,
    now: input.now,
  });
  if (input.persist !== false) {
    await persistInsightsReport(result.report).catch(() => undefined);
  }
  return result;
}

export {
  collectQualifiedEvidence,
  isEligibleCommunitySignal,
} from "@/lib/live/insights/evidence";
export { clusterEvidence } from "@/lib/live/insights/cluster";
export { routeCluster } from "@/lib/live/insights/route";
export { displayType, thesisGroundingViolations } from "@/lib/live/insights/synthesize";
export type { InsightsRunReport } from "@/lib/live/insights/diagnostics";
export type { QualifiedEvidence } from "@/lib/live/insights/evidence";
