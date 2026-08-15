import { RECURRENCE_DAYS, isAllowlistedRepo } from "@/lib/live/developer-community/config";
import type {
  CommunitySignal,
  DeveloperCommunityRejectReason,
  DeveloperCommunityStatus,
} from "@/lib/types";

export type GateDecision = {
  status: DeveloperCommunityStatus;
  reason?: DeveloperCommunityRejectReason;
};

function independentThreads(signal: CommunitySignal): number {
  return new Set(signal.evidence.map((item) => item.sourceUrl)).size;
}

function allowlistedAuthors(signal: CommunitySignal): number {
  return new Set(
    signal.evidence
      .filter(
        (item) =>
          item.sourceFamily === "github-issues" &&
          isAllowlistedRepo(item.repository)
      )
      .map((item) => item.authorId)
  ).size;
}

function recurrenceSatisfied(signal: CommunitySignal): boolean {
  const spanDays =
    (new Date(signal.lastSeenAt).getTime() -
      new Date(signal.firstSeenAt).getTime()) /
    (24 * 60 * 60 * 1000);
  return spanDays >= RECURRENCE_DAYS || independentThreads(signal) >= 2;
}

export function qualifyCommunitySignal(signal: CommunitySignal): GateDecision {
  if (
    signal.signalType === "BACKLASH" ||
    signal.signalType === "EMERGING_TOOL"
  ) {
    return { status: "WATCH", reason: "insufficient-evidence" };
  }

  if (!signal.topic || signal.topic === "other") {
    return { status: "REVIEW_QUEUE", reason: "no-product-implication" };
  }

  if (!signal.productImplication) {
    return { status: "REVIEW_QUEUE", reason: "no-product-implication" };
  }

  if (
    signal.evidence.length === 1 &&
    signal.evidence[0]?.sourceFamily === "hn"
  ) {
    return { status: "WATCH", reason: "single-source" };
  }

  if (!signal.evidence.some((item) => item.concreteArtifact)) {
    return { status: "REVIEW_QUEUE", reason: "no-concrete-artifact" };
  }

  const twoFamilies = signal.sourceCount >= 2;
  const threeAuthors = allowlistedAuthors(signal) >= 3;
  if (!twoFamilies && !threeAuthors) {
    if (
      signal.evidence.length === 1 &&
      signal.evidence[0]?.concreteArtifact &&
      signal.productImplication
    ) {
      return { status: "WATCH", reason: "insufficient-authors" };
    }
    if (signal.evidence.length === 1) {
      return { status: "REVIEW_QUEUE", reason: "isolated-bug" };
    }
    return { status: "WATCH", reason: "insufficient-authors" };
  }

  if (!recurrenceSatisfied(signal)) {
    return { status: "WATCH", reason: "insufficient-recurrence" };
  }

  return { status: "PUBLISH" };
}

export function applyCap(
  signals: CommunitySignal[],
  cap: number
): CommunitySignal[] {
  const publishable = signals.filter((item) => item.status === "PUBLISH");
  const rest = signals.filter((item) => item.status !== "PUBLISH");
  const ranked = [...publishable].sort(
    (left, right) =>
      new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime()
  );
  const published = ranked.slice(0, cap);
  const capped = ranked.slice(cap).map((item) => ({
    ...item,
    status: "WATCH" as const,
    reason: "capped" as const,
    confidence: "medium" as const,
  }));
  return [...published, ...capped, ...rest];
}
