import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixtures from "@/lib/live/insights/validation.fixtures.json";
import { buildInsights } from "@/lib/live/insights";
import { isEligibleCommunitySignal } from "@/lib/live/insights/evidence";
import { capabilityKeysFor } from "@/lib/live/insights/lexicon";
import { thesisGroundingViolations } from "@/lib/live/insights/synthesize";
import type {
  CommunitySignal,
  DeveloperCommunityCandidateType,
  DeveloperCommunityStatus,
  FeedItem,
  InsightStatus,
} from "@/lib/types";

type FixtureItem = {
  kind: string;
  id: string;
  title: string;
  source?: string;
  orgTag?: string;
  publishedAt?: string;
  lastSeenAt?: string;
  products?: string[];
  topic?: string;
  signalType?: string;
  status?: string;
  reason?: string;
  arxivId?: string;
  hiddenByCap?: boolean;
};

const NOW = new Date(fixtures.now);

function when(row: FixtureItem): string {
  return row.publishedAt ?? row.lastSeenAt ?? fixtures.now;
}

function brief(title: string): FeedItem["brief"] {
  return {
    whatHappened: title,
    whyItMatters: "fixture",
    potentialImpact: "fixture",
    keyTakeaway: "fixture",
  };
}

function olItem(row: FixtureItem): FeedItem {
  return {
    id: row.id,
    title: row.title,
    source: (row.source ?? "OpenAI") as FeedItem["source"],
    publishedAt: when(row),
    category: "Model Releases",
    summary: row.title,
    scores: { impact: 90, relevance: 90, trend: 90 },
    tier: "High Impact",
    tags: ["live", "official-launch", "core", "model-release", row.orgTag ?? "openai"],
    url: `https://example.test/${row.id}`,
    brief: brief(row.title),
    readingTimeMin: 1,
    officialLaunch: {
      eventId: row.id,
      eventType: "model-release",
      supportingSources: [],
    },
  };
}

function rpItem(row: FixtureItem): FeedItem {
  return {
    id: row.id,
    title: row.title,
    source: "arXiv",
    publishedAt: when(row),
    category: "Research Papers",
    summary: row.title,
    scores: { impact: 40, relevance: 40, trend: 40 },
    tier: "Emerging",
    tags: ["live", "research-paper", row.arxivId ?? ""].filter(Boolean),
    url: `https://arxiv.org/abs/${row.arxivId ?? row.id}`,
    brief: brief(row.title),
    readingTimeMin: 1,
    researchPaper: {
      arxivId: row.arxivId ?? row.id,
    },
  };
}

function dcSignal(row: FixtureItem): CommunitySignal {
  const lastSeenAt = when(row);
  return {
    signalId: row.id,
    topic: row.topic ?? "other",
    signalType: (row.signalType ?? "FRICTION") as DeveloperCommunityCandidateType,
    products: row.products ?? [],
    summary: row.title,
    evidence: [
      {
        evidenceId: `${row.id}-e1`,
        sourceFamily: "github-issues",
        sourceType: "github-issue",
        sourceUrl: `https://github.com/example/${row.id}`,
        product: row.products?.[0] ?? "unknown",
        normalizedTopic: row.topic ?? "other",
        candidateSignalType: "FRICTION",
        authorId: "author-a",
        createdAt: lastSeenAt,
        updatedAt: lastSeenAt,
        title: row.title,
        bodySummary: row.title,
        concreteArtifact: true,
        productImplication: true,
      },
    ],
    firstSeenAt: lastSeenAt,
    lastSeenAt,
    sourceCount: 2,
    uniqueAuthorCount: 3,
    confidence: "high",
    productImplication: true,
    status: (row.status ?? "PUBLISH") as DeveloperCommunityStatus,
    reason: row.reason as CommunitySignal["reason"],
  };
}

function fromCluster(items: FixtureItem[]) {
  const feedItems: FeedItem[] = [];
  const communitySignals: CommunitySignal[] = [];
  const cappedPassPapers: ReturnType<typeof buildInsights>["evidence"] = [];
  for (const row of items) {
    if (row.kind === "ol") feedItems.push(olItem(row));
    else if (row.kind === "rp") {
      if (row.hiddenByCap) {
        cappedPassPapers.push({
          objectId: row.id,
          role: "CAPABILITY",
          organization: row.arxivId ?? row.id,
          organizationKey: row.arxivId ?? row.id,
          productFamily: row.arxivId ?? row.id,
          title: row.title,
          source: "arXiv",
          timestamp: when(row),
          capabilityKeys: capabilityKeysFor(row.title),
          hiddenByCap: true,
          text: row.title,
        });
      } else {
        feedItems.push(rpItem(row));
      }
    } else {
      communitySignals.push(dcSignal(row));
    }
  }
  return { feedItems, communitySignals, cappedPassPapers };
}

function outcomeOf(items: FixtureItem[]): InsightStatus {
  const result = buildInsights({ ...fromCluster(items), now: NOW });
  if (result.published.length > 0) return "PUBLISH";
  if (result.report.counts.WATCH > 0) return "WATCH";
  return "NOT_INSIGHT";
}

describe("Insights V1", () => {
  it("freezes the 18-cluster validation set", () => {
    const counts = { PUBLISH: 0, WATCH: 0, NOT_INSIGHT: 0 };
    for (const cluster of fixtures.clusters) {
      const status = outcomeOf(cluster.items as FixtureItem[]);
      expect(status, cluster.id).toBe(cluster.expected);
      counts[status] += 1;
    }
    expect(counts).toEqual(fixtures.expectedCounts);
  });

  it("publishes the four regression Insights", () => {
    const pool = fixtures.clusters
      .filter((cluster) =>
        [
          "coding-agent-onboarding",
          "tool-calling",
          "session-memory",
          "coding-agent-convergence",
        ].includes(cluster.id)
      )
      .flatMap((cluster) => cluster.items as FixtureItem[]);
    const result = buildInsights({ ...fromCluster(pool), now: NOW });
    const headlines = result.published.map((item) => item.headline);
    expect(headlines).toContain("Coding-agent setup is the real adoption gate");
    expect(headlines).toContain("Multi-turn tool calling is failing in production");
    expect(headlines).toContain(
      "Persistent agent state is expected faster than runtimes can reliably support it"
    );
    expect(headlines).toContain(
      "Coding agents are becoming the default lab product shape"
    );
    expect(result.published.length).toBeGreaterThanOrEqual(2);
    expect(result.published.length).toBeLessThanOrEqual(8);
    expect(new Set(headlines).size).toBe(headlines.length);
  });

  it("lets Feed-hidden qualified DC evidence contribute", () => {
    const result = buildInsights({
      ...fromCluster(
        (fixtures.clusters.find((cluster) => cluster.id === "tool-calling")?.items ??
          []) as FixtureItem[]
      ),
      now: NOW,
    });
    expect(result.published[0]?.evidence.some((row) => row.objectId === "dc-cline-tools")).toBe(
      true
    );
  });

  it("lets RP cap-hidden PASS contribute and excludes BORDERLINE", () => {
    const hidden = {
      kind: "rp" as const,
      id: "rp-hidden",
      title: "LycheeMemory V2: Efficient Long-Term Memory for LLM Agents",
      publishedAt: "2026-08-12T00:00:00.000Z",
      arxivId: "2608.12990",
      hiddenByCap: true,
    };
    const borderline = rpItem({
      kind: "rp",
      id: "rp-border",
      title: "A theory of convex calibration",
      publishedAt: "2026-08-12T00:00:00.000Z",
      arxivId: "2608.00002",
    });
    borderline.tags = ["live"];
    delete borderline.researchPaper;
    const adoption = (fixtures.clusters.find((cluster) => cluster.id === "session-memory")
      ?.items ?? []) as FixtureItem[];
    const result = buildInsights({
      ...fromCluster([...adoption.filter((row) => row.kind !== "rp"), hidden]),
      feedItems: [
        ...fromCluster(adoption.filter((row) => row.kind !== "rp")).feedItems,
        borderline,
      ],
      now: NOW,
    });
    expect(result.evidence.some((row) => row.objectId === "rp-hidden")).toBe(true);
    expect(result.evidence.some((row) => row.objectId === "rp-border")).toBe(false);
  });

  it("excludes ordinary DC WATCH and BACKGROUND", () => {
    const weak: CommunitySignal = {
      ...dcSignal({
        kind: "dc",
        id: "dc-weak",
        title: "claude-code: tool calling is breaking multi-turn agent workflows",
        products: ["claude-code"],
        topic: "tool-calling",
        signalType: "FRICTION",
        status: "WATCH",
        reason: "insufficient-authors",
        lastSeenAt: "2026-08-14T00:00:00.000Z",
      }),
    };
    const background: FeedItem = {
      id: "rss-1",
      title: "Several companies are working on AI agents",
      source: "Tech Blog",
      publishedAt: "2026-08-14T00:00:00.000Z",
      category: "Industry Trends",
      summary: "trend",
      scores: { impact: 99, relevance: 99, trend: 99 },
      tier: "High Impact",
      tags: ["live"],
      url: "https://example.test/rss",
      brief: brief("Several companies are working on AI agents"),
      readingTimeMin: 1,
    };
    expect(isEligibleCommunitySignal(weak)).toBe(false);
    const result = buildInsights({
      feedItems: [background],
      communitySignals: [weak],
      now: NOW,
    });
    expect(result.evidence).toEqual([]);
    expect(result.published).toEqual([]);
  });

  it("does not let likes, scores, or Feed rank change Insight truth", () => {
    const items = (fixtures.clusters.find((cluster) => cluster.id === "tool-calling")
      ?.items ?? []) as FixtureItem[];
    const low = fromCluster(items);
    low.feedItems = low.feedItems.map((item) => ({
      ...item,
      scores: { impact: 1, relevance: 1, trend: 1 },
      tier: "Emerging" as const,
    }));
    const high = fromCluster(items);
    const left = buildInsights({ ...low, now: NOW });
    const right = buildInsights({ ...high, now: NOW });
    expect(left.published.map((item) => item.insightId)).toEqual(
      right.published.map((item) => item.insightId)
    );
    expect(left.published.map((item) => item.thesis)).toEqual(
      right.published.map((item) => item.thesis)
    );
  });

  it("keeps contradiction stance on opposing evidence", () => {
    const result = buildInsights({
      ...fromCluster(
        (fixtures.clusters.find((cluster) => cluster.id === "session-memory")?.items ??
          []) as FixtureItem[]
      ),
      now: NOW,
    });
    const insight = result.published.find((item) => item.contradiction);
    expect(insight).toBeTruthy();
    expect(insight?.evidence.some((row) => row.stance === "supports")).toBe(true);
    expect(insight?.evidence.some((row) => row.stance === "contradicts")).toBe(true);
  });

  it("does not invent names in a published thesis", () => {
    const pool = fixtures.clusters
      .filter((cluster) => cluster.expected === "PUBLISH")
      .flatMap((cluster) => cluster.items as FixtureItem[]);
    const result = buildInsights({ ...fromCluster(pool), now: NOW });
    for (const insight of result.published) {
      expect(thesisGroundingViolations(insight.thesis, result.evidence.filter((row) =>
        insight.evidence.some((item) => item.objectId === row.objectId)
      ))).toEqual([]);
      expect(insight.actionVerb).toMatch(/^(reconsider|test|watch|validate)$/);
      expect(insight.productImplication.toLowerCase()).not.toMatch(/\bbuild this\b/);
    }
  });

  it("does not import ranking topicOf or compositeScore", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/lib/live/insights/index.ts"),
      "utf8"
    );
    expect(source).not.toMatch("topicOf");
    expect(source).not.toMatch("compositeScore");
    expect(source).not.toMatch("rankUnifiedFeed");
  });
});
