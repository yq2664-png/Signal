import { KNOWN_NAMES } from "@/lib/live/insights/config";
import type { EvidenceCluster } from "@/lib/live/insights/cluster";
import type { QualifiedEvidence } from "@/lib/live/insights/evidence";
import { rolesOf } from "@/lib/live/insights/route";
import type {
  Insight,
  InsightActionVerb,
  InsightConfidence,
  InsightEvidence,
  InsightFreshness,
  InsightStance,
  InsightType,
} from "@/lib/types";

const DIRECTION =
  /\b(becoming|shifting|failing|blocking|breaking|shipping|drop(?:ping)?|expected|converging|remain(?:ing)?|positioned|faster than|default|changing)\b/i;

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function listOrgs(members: QualifiedEvidence[]): string[] {
  return unique(members.map((item) => item.organization));
}

function listFamilies(members: QualifiedEvidence[]): string[] {
  return unique(
    members
      .filter((item) => item.role === "ADOPTION")
      .map((item) => item.productFamily)
  );
}

function join(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function agree(names: string[], singular: string, plural: string): string {
  return names.length === 1 ? singular : plural;
}

function stanceFor(
  item: QualifiedEvidence,
  contradiction: boolean
): InsightStance {
  if (!contradiction) return "supports";
  const friction =
    item.role === "ADOPTION" &&
    (item.signalType === "FRICTION" ||
      item.capabilityKeys.includes("onboarding") ||
      item.capabilityKeys.includes("tool-calling") ||
      item.capabilityKeys.includes("session-state") ||
      item.capabilityKeys.includes("mcp"));
  if (friction) return "contradicts";
  if (item.role === "SUPPLY" || item.role === "CAPABILITY") return "supports";
  return "qualifies";
}

export function thesisGroundingViolations(
  thesis: string,
  members: QualifiedEvidence[]
): string[] {
  const allowed = new Set(
    [
      ...members.flatMap((item) => [
        item.organization,
        item.productFamily,
        item.title,
        item.source,
      ]),
    ]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
  const violations: string[] = [];
  for (const name of KNOWN_NAMES) {
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!pattern.test(thesis)) continue;
    const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.some((token) => !allowed.has(token))) {
      violations.push(name);
    }
  }
  return violations;
}

function copyFor(cluster: EvidenceCluster): {
  headline: string;
  thesis: string;
  whyItMatters: string;
  productImplication: string;
  actionVerb: InsightActionVerb;
  type: InsightType;
} | null {
  const supply = cluster.members.filter((item) => item.role === "SUPPLY");
  const capability = cluster.members.filter((item) => item.role === "CAPABILITY");
  const adoption = cluster.members.filter((item) => item.role === "ADOPTION");
  const supplyOrgs = join(listOrgs(supply));
  const capabilityOrgs = join(listOrgs(capability));
  const families = join(listFamilies(adoption));
  const allOrgs = join(listOrgs(cluster.members));

  if (cluster.id === "coding-agent-onboarding" && supply.length && adoption.length) {
    return {
      type: "FRICTION_PATTERN",
      headline: "Coding-agent setup is the real adoption gate",
      thesis: `${supplyOrgs} are shipping coding agents, while ${families} report install and platform setup blocking adoption.`,
      whyItMatters:
        "A launch can look like the product is ready. Qualified adoption evidence says first-run setup is the actual gate.",
      productImplication:
        "Reconsider treating an agent launch as shipped until first-run install is proven on the platforms named in these reports.",
      actionVerb: "reconsider",
    };
  }
  if (cluster.id === "tool-calling") {
    return {
      type: "FRICTION_PATTERN",
      headline: "Multi-turn tool calling is failing in production",
      thesis: `Tool calling is breaking multi-turn workflows across ${families || allOrgs}.`,
      whyItMatters:
        "Multi-step agent UX assumes the tool loop holds. Qualified adoption evidence says the loop is the incident.",
      productImplication:
        "Validate any multi-step agent UX against tool-call failure before expanding autonomy.",
      actionVerb: "validate",
    };
  }
  if (cluster.id === "session-memory" || cluster.id === "persistent-memory") {
    const promiserNames = listOrgs([...supply, ...capability]);
    const promisers = join(promiserNames);
    if (promiserNames.length && adoption.length) {
      return {
        type: "EXPECTATION_SHIFT",
        headline:
          "Persistent agent state is expected faster than runtimes can reliably support it",
        thesis: `${promisers} ${agree(promiserNames, "treats", "treat")} long-horizon memory or context as product-ready, while ${families} are still dropping session state across turns.`,
        whyItMatters:
          "Persistence claims change what PMs design. Qualified adoption evidence says the session is the unit that actually breaks.",
        productImplication:
          "Watch persistence claims, and test session resume and compaction as user-facing reliability rather than an infrastructure footnote.",
        actionVerb: "watch",
      };
    }
    return {
      type: "FRICTION_PATTERN",
      headline: "Agent session state is failing in production",
      thesis: `${families || allOrgs} are still dropping session state or hitting memory and context overhead.`,
      whyItMatters:
        "Session reliability changes whether an agent can be designed as a persistent collaborator.",
      productImplication:
        "Test session resume and compaction as user-facing reliability before expanding persistent-agent UX.",
      actionVerb: "test",
    };
  }
  if (cluster.id === "coding-agent-convergence" && supply.length >= 3) {
    return {
      type: "CONVERGENCE",
      headline: "Coding agents are becoming the default lab product shape",
      thesis: `${supplyOrgs} are shipping coding or agent products around the model, not only a new model card.`,
      whyItMatters:
        "Competitive comparison shifts from a model table to agent UX: onboarding, tool loops, and session reliability.",
      productImplication:
        "Reconsider roadmap language that treats a chat-model upgrade and an agent product as the same launch.",
      actionVerb: "reconsider",
    };
  }
  if (cluster.id === "mcp-runtime") {
    return {
      type: "FRICTION_PATTERN",
      headline: `${allOrgs} runtime reliability is a recurring production friction`,
      thesis: `${families || allOrgs} report runtime reliability failing in production.`,
      whyItMatters:
        "Protocol reliability changes whether teams will depend on connected tools.",
      productImplication:
        "Watch runtime failure patterns before treating connected-tool support as default.",
      actionVerb: "watch",
    };
  }
  if (cluster.id === "multimodal-agent") {
    return {
      type: "CONVERGENCE",
      headline: "Vision is being folded into agent products",
      thesis: `${allOrgs} are attaching vision or multimodality to agent products rather than only to a standalone model SKU.`,
      whyItMatters:
        "If vision ships inside agents, UX defaults change from a camera feature to an agent loop.",
      productImplication:
        "Watch whether visual input is becoming a default agent expectation before redesigning around it.",
      actionVerb: "watch",
    };
  }
  if (cluster.id === "agent-skills") {
    return {
      type: "WORKFLOW_SHIFT",
      headline: "Agent workflow packaging is shifting how teams configure tools",
      thesis: `${allOrgs} show a shift toward packaged skills or workflow files for agent configuration.`,
      whyItMatters:
        "Packaging changes how product and design teams specify agent behavior.",
      productImplication:
        "Watch skill and workflow packaging before assuming chat settings are the configuration surface.",
      actionVerb: "watch",
    };
  }
  if (capability.length && !supply.length && !adoption.length) {
    return {
      type: "CAPABILITY_SHIFT",
      headline: `${allOrgs} point at a shared capability`,
      thesis: `${capabilityOrgs || allOrgs} describe a shared capability without a product or adoption change.`,
      whyItMatters: "Papers can precede a product change, but they are not the change yet.",
      productImplication: "Watch the capability until product or adoption evidence appears.",
      actionVerb: "watch",
    };
  }
  return {
    type: hasFriction(cluster) ? "FRICTION_PATTERN" : "ADOPTION_SHIFT",
    headline: `${allOrgs} show a shared change`,
    thesis: `${allOrgs} show the same underlying change across independent evidence.`,
    whyItMatters:
      "A repeated qualified pattern can change a product or workflow decision this quarter.",
    productImplication: "Watch this pattern and validate it against the named evidence before changing the roadmap.",
    actionVerb: "watch",
  };
}

function hasFriction(cluster: EvidenceCluster): boolean {
  return cluster.members.some(
    (item) =>
      item.signalType === "FRICTION" ||
      item.capabilityKeys.includes("onboarding") ||
      item.capabilityKeys.includes("tool-calling") ||
      item.capabilityKeys.includes("session-state")
  );
}

export function synthesizeInsight(input: {
  cluster: EvidenceCluster;
  contradiction: boolean;
  confidence: InsightConfidence;
  freshness: InsightFreshness;
  now: Date;
}): { insight: Insight; groundingViolations: string[] } | null {
  const copy = copyFor(input.cluster);
  if (!copy) return null;
  if (!DIRECTION.test(copy.thesis)) return null;
  const violations = thesisGroundingViolations(copy.thesis, input.cluster.members);
  if (violations.length > 0) return null;

  const timestamps = input.cluster.members.map((item) => item.timestamp).sort();
  const evidence: InsightEvidence[] = input.cluster.members.map((item) => ({
    objectId: item.objectId,
    role: item.role,
    stance: stanceFor(item, input.contradiction),
    source: item.source,
    organization: item.organization,
    title: item.title,
    timestamp: item.timestamp,
    url: item.url,
  }));
  const windowEnd = input.now.toISOString();
  const windowStart = new Date(
    input.now.getTime() - 21 * 24 * 60 * 60 * 1000
  ).toISOString();

  return {
    insight: {
      insightId: `insight-${input.cluster.id}`,
      headline: copy.headline,
      thesis: copy.thesis,
      type: copy.type,
      clusterKeys: input.cluster.keys,
      evidence,
      whyItMatters: copy.whyItMatters,
      productImplication: copy.productImplication,
      actionVerb: copy.actionVerb,
      confidence: input.confidence,
      status: "PUBLISH",
      freshness: input.freshness,
      contradiction: input.contradiction,
      timeWindow: { start: windowStart, end: windowEnd },
      firstSeenAt: timestamps[0],
      lastUpdatedAt: timestamps[timestamps.length - 1],
      roles: rolesOf(input.cluster.members),
      organizations: listOrgs(input.cluster.members),
    },
    groundingViolations: [],
  };
}

export function displayType(type: InsightType): string {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
