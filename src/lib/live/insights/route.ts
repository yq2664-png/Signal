import { isCurrent } from "@/lib/live/insights/evidence";
import { sharesClusterChange, type EvidenceCluster } from "@/lib/live/insights/cluster";
import type { QualifiedEvidence } from "@/lib/live/insights/evidence";
import type {
  InsightConfidence,
  InsightFreshness,
  InsightRole,
  InsightStatus,
} from "@/lib/types";

export function independentKeys(members: QualifiedEvidence[]): string[] {
  return [
    ...new Set(
      members.map((item) =>
        item.role === "ADOPTION" ? item.productFamily : item.organizationKey
      )
    ),
  ];
}

export function rolesOf(members: QualifiedEvidence[]): InsightRole[] {
  return [...new Set(members.map((item) => item.role))];
}

export function freshnessOf(
  members: QualifiedEvidence[],
  now: Date
): InsightFreshness {
  if (members.some((item) => isCurrent(item.timestamp, now))) return "CURRENT";
  if (members.length > 0) return "AGING";
  return "STALE";
}

export function survivorshipHolds(cluster: EvidenceCluster): boolean {
  const members = cluster.members.filter((item) =>
    sharesClusterChange(item, cluster.keys)
  );
  if (members.length < 2) return false;
  return members.every((item) =>
    members.some(
      (other) =>
        other.objectId !== item.objectId &&
        sharesClusterChange(other, cluster.keys)
    )
  );
}

function allSupplySameOrg(members: QualifiedEvidence[]): boolean {
  if (!members.every((item) => item.role === "SUPPLY")) return false;
  return independentKeys(members).length === 1;
}

export function routeCluster(
  cluster: EvidenceCluster,
  now: Date
): {
  status: InsightStatus;
  freshness: InsightFreshness;
  confidence: InsightConfidence;
  contradictionReady: boolean;
  reason: string;
} {
  const members = cluster.members.filter((item) =>
    sharesClusterChange(item, cluster.keys)
  );
  const freshness = freshnessOf(members, now);
  const roles = rolesOf(members);
  const independent = independentKeys(members);
  const hasSupply = roles.includes("SUPPLY");
  const hasCapability = roles.includes("CAPABILITY");
  const hasAdoption = roles.includes("ADOPTION");
  const contradictionReady =
    (hasSupply || hasCapability) &&
    hasAdoption &&
    members.some((item) =>
      item.role === "ADOPTION" &&
      (item.signalType === "FRICTION" ||
        item.capabilityKeys.includes("onboarding") ||
        item.capabilityKeys.includes("tool-calling") ||
        item.capabilityKeys.includes("session-state") ||
        item.capabilityKeys.includes("mcp"))
    );

  if (members.length < 2) {
    return {
      status: "NOT_INSIGHT",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "one-item",
    };
  }
  if (!survivorshipHolds({ ...cluster, members })) {
    return {
      status: "NOT_INSIGHT",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "survivorship",
    };
  }
  if (allSupplySameOrg(members)) {
    return {
      status: "NOT_INSIGHT",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "same-org-supply",
    };
  }
  if (freshness === "STALE") {
    return {
      status: "NOT_INSIGHT",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "stale",
    };
  }
  if (independent.length < 2) {
    return {
      status: "WATCH",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "one-family",
    };
  }
  if (freshness === "AGING") {
    return {
      status: "WATCH",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "aging",
    };
  }
  if (hasSupply && hasCapability && !hasAdoption) {
    return {
      status: "WATCH",
      freshness,
      confidence: "MEDIUM",
      contradictionReady,
      reason: "supply-capability-no-adoption",
    };
  }

  const sameRole = roles.length === 1;
  if (sameRole && roles[0] === "SUPPLY") {
    if (independent.length >= 3) {
      return {
        status: "PUBLISH",
        freshness,
        confidence: independent.length >= 4 ? "HIGH" : "MEDIUM",
        contradictionReady,
        reason: "convergence",
      };
    }
    return {
      status: "WATCH",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "supply-under-three-orgs",
    };
  }
  if (sameRole && roles[0] === "ADOPTION") {
    const friction = members.every(
      (item) =>
        item.signalType === "FRICTION" ||
        item.capabilityKeys.includes("onboarding") ||
        item.capabilityKeys.includes("tool-calling") ||
        item.capabilityKeys.includes("session-state") ||
        item.capabilityKeys.includes("mcp")
    );
    if (friction && independent.length >= 2) {
      return {
        status: "PUBLISH",
        freshness,
        confidence: "MEDIUM",
        contradictionReady,
        reason: "friction-pattern",
      };
    }
    return {
      status: "WATCH",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "adoption-incomplete",
    };
  }
  if (sameRole && roles[0] === "CAPABILITY") {
    return {
      status: "NOT_INSIGHT",
      freshness,
      confidence: "LOW",
      contradictionReady,
      reason: "papers-only",
    };
  }

  if ((hasSupply && hasAdoption) || (hasCapability && hasAdoption)) {
    const confidence: InsightConfidence =
      roles.length >= 2 && (independent.length >= 3 || contradictionReady)
        ? "HIGH"
        : members.some((item) => item.hiddenByCap)
          ? "LOW"
          : "MEDIUM";
    return {
      status: "PUBLISH",
      freshness,
      confidence,
      contradictionReady,
      reason: "cross-role",
    };
  }

  return {
    status: "WATCH",
    freshness,
    confidence: "LOW",
    contradictionReady,
    reason: "incomplete",
  };
}
