import type { InsightCapabilityKey, InsightRole } from "@/lib/types";
import type { QualifiedEvidence } from "@/lib/live/insights/evidence";

export type JoinGroup = {
  id: string;
  keys: InsightCapabilityKey[];
  requireKeys?: InsightCapabilityKey[];
  roleFilter?: InsightRole;
};

export const JOIN_GROUPS: JoinGroup[] = [
  {
    id: "coding-agent-onboarding",
    keys: ["coding-agent", "onboarding"],
    requireKeys: ["onboarding"],
  },
  {
    id: "tool-calling",
    keys: ["tool-calling"],
    requireKeys: ["tool-calling"],
  },
  {
    id: "session-memory",
    keys: ["session-state", "persistent-memory"],
    requireKeys: ["session-state"],
  },
  {
    id: "coding-agent-convergence",
    keys: ["coding-agent"],
    requireKeys: ["coding-agent"],
    roleFilter: "SUPPLY",
  },
  {
    id: "persistent-memory",
    keys: ["persistent-memory"],
    requireKeys: ["persistent-memory"],
  },
  {
    id: "multimodal-agent",
    keys: ["multimodal-agent"],
    requireKeys: ["multimodal-agent"],
  },
  {
    id: "mcp-runtime",
    keys: ["mcp"],
    requireKeys: ["mcp"],
  },
  {
    id: "agent-skills",
    keys: ["agent-skills"],
    requireKeys: ["agent-skills"],
  },
  {
    id: "voice",
    keys: ["voice"],
    requireKeys: ["voice"],
  },
  {
    id: "generative-ui",
    keys: ["generative-ui"],
    requireKeys: ["generative-ui"],
  },
];

export type EvidenceCluster = {
  id: string;
  keys: InsightCapabilityKey[];
  members: QualifiedEvidence[];
};

function hasKey(item: QualifiedEvidence, key: InsightCapabilityKey): boolean {
  return item.capabilityKeys.includes(key);
}

function matchesGroup(item: QualifiedEvidence, group: JoinGroup): boolean {
  if (group.roleFilter && item.role !== group.roleFilter) return false;
  if (group.id === "coding-agent-onboarding") {
    if (item.role === "SUPPLY") return hasKey(item, "coding-agent");
    return hasKey(item, "onboarding");
  }
  if (group.id === "session-memory") {
    return hasKey(item, "session-state") || hasKey(item, "persistent-memory");
  }
  if (group.id === "mcp-runtime") {
    return hasKey(item, "mcp") && /runtime|mcp-runtime|reliability-transport/i.test(item.text);
  }
  return group.keys.some((key) => hasKey(item, key));
}

export function clusterEvidence(evidence: QualifiedEvidence[]): EvidenceCluster[] {
  const clusters: EvidenceCluster[] = [];
  for (const group of JOIN_GROUPS) {
    const members = evidence.filter((item) => matchesGroup(item, group));
    if (members.length === 0) continue;
    if (
      group.requireKeys &&
      !group.requireKeys.every((key) => members.some((item) => hasKey(item, key)))
    ) {
      continue;
    }
    clusters.push({
      id: group.id,
      keys: group.keys,
      members,
    });
  }
  return clusters;
}

export function sharesClusterChange(
  item: QualifiedEvidence,
  keys: InsightCapabilityKey[]
): boolean {
  return item.capabilityKeys.some((key) => keys.includes(key));
}
