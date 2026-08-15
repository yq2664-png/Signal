import { groupEvidence } from "@/lib/live/developer-community/cluster";
import { PUBLISH_CAP } from "@/lib/live/developer-community/config";
import {
  buildRunReport,
  persistRunReport,
  type DeveloperCommunityRunReport,
} from "@/lib/live/developer-community/diagnostics";
import { applyCap, qualifyCommunitySignal } from "@/lib/live/developer-community/gate";
import {
  fetchAllowlistedIssues,
  type IssueCaptureResult,
} from "@/lib/live/developer-community/github";
import { fetchHnEvidence, type HnCaptureResult } from "@/lib/live/developer-community/hn";
import { persistCommunityQueue } from "@/lib/live/developer-community/queue";
import { communitySignalsToFeedItems } from "@/lib/live/developer-community/to-feed-item";
import type { CommunitySignal, DeveloperCommunityEvidence, FeedItem } from "@/lib/types";

export type DeveloperCommunityFetchResult = {
  data: FeedItem[];
  errors: string[];
  report?: DeveloperCommunityRunReport;
  signals?: CommunitySignal[];
};

export function buildCommunitySignals(
  evidence: DeveloperCommunityEvidence[],
  publishCap = PUBLISH_CAP
): CommunitySignal[] {
  const grouped = groupEvidence(evidence).map((signal) => {
    const decision = qualifyCommunitySignal(signal);
    return {
      ...signal,
      status: decision.status,
      reason: decision.reason,
      confidence:
        decision.status === "PUBLISH" ? ("high" as const) : signal.confidence,
    };
  });
  return applyCap(grouped, publishCap);
}

export function buildDeveloperCommunityFeed(
  evidence: DeveloperCommunityEvidence[],
  publishCap = PUBLISH_CAP
): { items: FeedItem[]; signals: CommunitySignal[] } {
  const signals = buildCommunitySignals(evidence, publishCap);
  return {
    items: communitySignalsToFeedItems(signals),
    signals,
  };
}

export async function fetchDeveloperCommunityFeedItems(options?: {
  now?: Date;
  persist?: boolean;
}): Promise<DeveloperCommunityFetchResult> {
  const now = options?.now ?? new Date();
  const persist = options?.persist !== false;
  const [hn, github] = await Promise.all([
    fetchHnEvidence(now),
    fetchAllowlistedIssues(now),
  ]);
  const evidence = [...hn.captured, ...github.captured];
  const built = buildDeveloperCommunityFeed(evidence);
  const report = buildRunReport({
    hn,
    github,
    signals: built.signals,
    cards: built.items.length,
  });
  if (persist) {
    await persistRunReport(report).catch(() => undefined);
    await persistCommunityQueue(built.signals).catch(() => undefined);
  }
  return {
    data: built.items,
    errors: report.errors,
    report,
    signals: built.signals,
  };
}

export type { IssueCaptureResult, HnCaptureResult };
export { fetchAllowlistedIssues, fetchHnEvidence };
export { isAllowlistedRepo, ALLOWLISTED_REPOS, PUBLISH_CAP, issueWindowDays, issueWindowStart, isWithinIssueWindow, EVIDENCE_CAP_PER_REPO, CLUSTER_WINDOW_DAYS, HIGH_VOLUME_REPOS } from "@/lib/live/developer-community/config";
export { issueToEvidence, collectRepoEvidence } from "@/lib/live/developer-community/github";
export { hnHitToEvidence } from "@/lib/live/developer-community/hn";
export { clusterKey, clusterWindowId, withinClusterWindow, groupEvidence } from "@/lib/live/developer-community/cluster";
export { qualifyCommunitySignal, applyCap } from "@/lib/live/developer-community/gate";
export { communitySignalToFeedItem } from "@/lib/live/developer-community/to-feed-item";
