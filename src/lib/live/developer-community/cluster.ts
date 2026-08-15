import { CLUSTER_WINDOW_DAYS } from "@/lib/live/developer-community/config";
import type {
  CommunitySignal,
  DeveloperCommunityEvidence,
} from "@/lib/types";
import { slugId } from "@/lib/live/normalize";

const WINDOW_MS = CLUSTER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function clusterWindowId(iso: string): string {
  const ms = new Date(iso).getTime();
  const bucket = Math.floor(ms / WINDOW_MS);
  return String(Number.isFinite(bucket) ? bucket : 0);
}

export function withinClusterWindow(leftIso: string, rightIso: string): boolean {
  return (
    Math.abs(new Date(leftIso).getTime() - new Date(rightIso).getTime()) <=
    WINDOW_MS
  );
}

export function clusterKey(evidence: DeveloperCommunityEvidence): string {
  return `${evidence.product}|${evidence.normalizedTopic}`;
}

function headline(product: string, topic: string): string {
  const labels: Record<string, string> = {
    "mcp-runtime": "runtime reliability is a recurring production friction",
    "reliability-transport": "transport and reconnect failures are showing up in production",
    "tool-calling": "tool calling is breaking multi-turn agent workflows",
    "session-failure": "session state is dropping across turns",
    "memory-context": "memory and context overhead is changing how agents are operated",
    "auth-security": "auth and sandbox behavior is affecting what teams will ship",
    "workflow-skills": "agent workflow packaging is shifting how teams configure tools",
    "install-platform": "install and platform setup is blocking adoption",
    other: "a repeated implementation pattern is emerging",
  };
  return `${product}: ${labels[topic] ?? labels.other}`;
}

export function groupEvidence(
  evidence: DeveloperCommunityEvidence[]
): CommunitySignal[] {
  const groups = new Map<string, DeveloperCommunityEvidence[]>();
  for (const item of evidence) {
    const key = clusterKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const windows: Array<{ key: string; items: DeveloperCommunityEvidence[] }> =
    [];
  for (const [key, items] of groups.entries()) {
    const sorted = [...items].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
    let current: DeveloperCommunityEvidence[] = [];
    let windowStart = 0;
    for (const item of sorted) {
      const created = new Date(item.createdAt).getTime();
      if (current.length === 0) {
        current = [item];
        windowStart = created;
        continue;
      }
      if (created - windowStart <= WINDOW_MS) {
        current.push(item);
        continue;
      }
      windows.push({ key, items: current });
      current = [item];
      windowStart = created;
    }
    if (current.length > 0) windows.push({ key, items: current });
  }

  return windows.map(({ key, items: sorted }) => {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const authors = new Set(sorted.map((item) => item.authorId));
    const families = new Set(sorted.map((item) => item.sourceFamily));
    const typeCounts = new Map<string, number>();
    for (const item of sorted) {
      typeCounts.set(
        item.candidateSignalType,
        (typeCounts.get(item.candidateSignalType) ?? 0) + 1
      );
    }
    const signalType = [...typeCounts.entries()].sort(
      (left, right) => right[1] - left[1]
    )[0]?.[0] as CommunitySignal["signalType"];
    const implication = sorted.some((item) => item.productImplication);
    return {
      signalId: slugId("dc", `${key}|${clusterWindowId(first.createdAt)}`),
      topic: first.normalizedTopic,
      signalType,
      products: [...new Set(sorted.map((item) => item.product))],
      summary: headline(first.product, first.normalizedTopic),
      evidence: sorted,
      firstSeenAt: first.createdAt,
      lastSeenAt: last.updatedAt || last.createdAt,
      sourceCount: families.size,
      uniqueAuthorCount: authors.size,
      confidence: authors.size >= 3 && families.size >= 2 ? "high" : "medium",
      productImplication: implication,
      status: "REVIEW_QUEUE",
    };
  });
}
