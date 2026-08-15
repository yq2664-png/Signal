import { describe, expect, it } from "vitest";
import fixtures from "@/lib/live/developer-community/validation.fixtures.json";
import {
  hasConcreteArtifact,
  hasProductImplication,
} from "@/lib/live/developer-community/artifact";
import {
  ALLOWLISTED_REPOS,
  CLUSTER_WINDOW_DAYS,
  EVIDENCE_CAP_PER_REPO,
  HIGH_VOLUME_REPOS,
  PUBLISH_CAP,
  isAllowlistedRepo,
  isWithinIssueWindow,
  issueWindowDays,
} from "@/lib/live/developer-community/config";
import {
  clusterKey,
  groupEvidence,
  withinClusterWindow,
} from "@/lib/live/developer-community/cluster";
import {
  evidenceExclusion,
  isBotAuthor,
  isFeatureRequest,
  isPullRequest,
} from "@/lib/live/developer-community/exclude";
import {
  applyCap,
  qualifyCommunitySignal,
} from "@/lib/live/developer-community/gate";
import {
  collectRepoEvidence,
  issueToEvidence,
} from "@/lib/live/developer-community/github";
import { hnHitToEvidence } from "@/lib/live/developer-community/hn";
import {
  buildCommunitySignals,
  buildDeveloperCommunityFeed,
} from "@/lib/live/developer-community";
import { resolveProduct } from "@/lib/live/developer-community/products";
import {
  candidateTypeFor,
  normalizeTopic,
} from "@/lib/live/developer-community/topics";
import type { AllowlistedRepo } from "@/lib/live/developer-community/config";
import type {
  CommunitySignal,
  DeveloperCommunityEvidence,
} from "@/lib/types";

type Fixture = (typeof fixtures.examples)[number];

function fromFixture(
  example: Fixture
): DeveloperCommunityEvidence | { rejected: string } {
  if (example.sourceFamily === "hn") {
    const result = hnHitToEvidence({
      objectID: example.id,
      title: example.title,
      author: example.authorId,
      points: example.points,
      created_at: example.createdAt,
      story_text: example.body,
      url: example.url,
      stars: example.stars,
    });
    if ("rejected" in result) return { rejected: result.rejected.reason };
    return result.evidence;
  }
  const repo = example.repository as AllowlistedRepo;
  const result = issueToEvidence(repo, {
    id: Number(example.id.replace(/\D/g, "") || 1),
    number: Number(example.id.replace(/\D/g, "") || 1),
    title: example.title,
    body: example.body,
    html_url: example.url,
    created_at: example.createdAt,
    updated_at: example.createdAt,
    comments: example.comments,
    user: { login: example.authorId, type: "User" },
  });
  if ("rejected" in result) return { rejected: result.rejected.reason };
  return result.evidence;
}

function evidence(
  overrides: Partial<DeveloperCommunityEvidence> &
    Pick<DeveloperCommunityEvidence, "evidenceId" | "authorId" | "sourceUrl">
): DeveloperCommunityEvidence {
  return {
    sourceFamily: "github-issues",
    sourceType: "github-issue",
    repository: "modelcontextprotocol/servers",
    product: "mcp",
    normalizedTopic: "mcp-runtime",
    candidateSignalType: "FRICTION",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    title: "mcp-server-fetch fails to start",
    bodySummary: "repro with config and tool call",
    concreteArtifact: true,
    productImplication: true,
    ...overrides,
  };
}

function issuePayload(
  overrides: {
    number?: number;
    title?: string;
    body?: string;
    created_at?: string;
    user?: { login?: string; type?: string };
    pull_request?: unknown;
    comments?: number;
    html_url?: string;
  } = {}
) {
  const number = overrides.number ?? 1;
  return {
    id: number,
    number,
    title: overrides.title ?? `mcp-server-fetch fails to start ${number}`,
    body:
      overrides.body ??
      "Repro: mcp-server-fetch fails to start. Steps to reproduce with ```json``` tool call.",
    html_url:
      overrides.html_url ??
      `https://github.com/modelcontextprotocol/servers/issues/${number}`,
    created_at: overrides.created_at ?? "2026-08-10T00:00:00.000Z",
    updated_at: overrides.created_at ?? "2026-08-10T00:00:00.000Z",
    comments: overrides.comments,
    pull_request: overrides.pull_request,
    user: overrides.user ?? { login: `author-${number}`, type: "User" },
  };
}

describe("Developer Community V1 allowlist and ingest", () => {
  it("enforces the frozen 8-repo allowlist and rejects held repositories", () => {
    expect(ALLOWLISTED_REPOS).toEqual([
      "modelcontextprotocol/servers",
      "modelcontextprotocol/python-sdk",
      "modelcontextprotocol/typescript-sdk",
      "anthropics/claude-code",
      "openai/openai-python",
      "cline/cline",
      "anomalyco/opencode",
      "vercel/ai",
    ]);
    expect(isAllowlistedRepo("langchain-ai/langchain")).toBe(false);
    expect(isAllowlistedRepo("langchain-ai/langgraph")).toBe(false);
    expect(isAllowlistedRepo("Aider-AI/aider")).toBe(false);
    expect(isAllowlistedRepo("openai/openai-node")).toBe(false);
    expect(isAllowlistedRepo("modelcontextprotocol/modelcontextprotocol")).toBe(
      false
    );
    const blocked = collectRepoEvidence("langchain-ai/langchain", [
      issuePayload(),
    ]);
    expect(blocked.captured).toHaveLength(0);
    expect(blocked.rejected[0]?.reason).toBe("not-allowlisted");
  });

  it("excludes pull requests", () => {
    expect(isPullRequest({ pull_request: { url: "x" } })).toBe(true);
    const result = issueToEvidence("cline/cline", {
      ...issuePayload({ pull_request: {} }),
    });
    expect("rejected" in result && result.rejected.reason).toBe("pull-request");
  });

  it("excludes bot authors", () => {
    expect(isBotAuthor("claude[bot]", "Bot")).toBe(true);
    expect(isBotAuthor("human", "User")).toBe(false);
    const result = issueToEvidence("cline/cline", {
      ...issuePayload({
        user: { login: "dependabot[bot]", type: "Bot" },
      }),
    });
    expect("rejected" in result && result.rejected.reason).toBe("bot-author");
  });

  it("drops configured feature requests", () => {
    expect(isFeatureRequest("[FEATURE]: Add Qwen3.8-27B")).toBe(true);
    const result = issueToEvidence("anomalyco/opencode", {
      ...issuePayload({
        title: "[FEATURE]: Add Qwen3.8-27B",
        body: "Please add support for this model.",
      }),
    });
    expect("rejected" in result && result.rejected.reason).toBe(
      "feature-request"
    );
  });

  it("uses a 7-day window for high-volume repos and 30 days otherwise", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    expect(issueWindowDays("anthropics/claude-code")).toBe(7);
    expect(issueWindowDays("anomalyco/opencode")).toBe(7);
    expect(HIGH_VOLUME_REPOS).toEqual([
      "anthropics/claude-code",
      "anomalyco/opencode",
    ]);
    expect(issueWindowDays("vercel/ai")).toBe(30);
    expect(
      isWithinIssueWindow(
        "anthropics/claude-code",
        "2026-08-04T00:00:00.000Z",
        now
      )
    ).toBe(false);
    expect(
      isWithinIssueWindow("vercel/ai", "2026-08-04T00:00:00.000Z", now)
    ).toBe(true);
    const highVolume = collectRepoEvidence(
      "anthropics/claude-code",
      [
        issuePayload({
          created_at: "2026-08-04T00:00:00.000Z",
          title: "mcp-server-fetch fails to start old",
        }),
        issuePayload({
          number: 2,
          created_at: "2026-08-12T00:00:00.000Z",
          title: "mcp-server-fetch fails to start recent",
        }),
      ],
      now
    );
    expect(highVolume.captured).toHaveLength(1);
    expect(highVolume.captured[0]?.createdAt).toBe("2026-08-12T00:00:00.000Z");
  });

  it("caps evidence at 40 records per repository per run", () => {
    expect(EVIDENCE_CAP_PER_REPO).toBe(40);
    const issues = Array.from({ length: 45 }, (_, index) =>
      issuePayload({ number: index + 1 })
    );
    const result = collectRepoEvidence(
      "modelcontextprotocol/servers",
      issues,
      new Date("2026-08-15T00:00:00.000Z")
    );
    expect(result.captured).toHaveLength(40);
  });
});

describe("Developer Community V1 clustering and gate", () => {
  it("groups by product + topic and keeps a 14-day window", () => {
    expect(CLUSTER_WINDOW_DAYS).toBe(14);
    const a = evidence({
      evidenceId: "a",
      authorId: "one",
      sourceUrl: "https://github.com/modelcontextprotocol/servers/issues/1",
    });
    const b = evidence({
      evidenceId: "b",
      authorId: "two",
      sourceUrl: "https://github.com/modelcontextprotocol/servers/issues/2",
      createdAt: "2026-08-12T00:00:00.000Z",
    });
    const later = evidence({
      evidenceId: "later",
      authorId: "three",
      sourceUrl: "https://github.com/modelcontextprotocol/servers/issues/3",
      createdAt: "2026-08-30T00:00:00.000Z",
    });
    const otherProduct = evidence({
      evidenceId: "other",
      authorId: "four",
      sourceUrl: "https://github.com/anthropics/claude-code/issues/1",
      repository: "anthropics/claude-code",
      product: "claude-code",
    });
    expect(clusterKey(a)).toBe(clusterKey(b));
    expect(withinClusterWindow(a.createdAt, b.createdAt)).toBe(true);
    expect(withinClusterWindow(a.createdAt, later.createdAt)).toBe(false);
    expect(clusterKey(a)).not.toBe(clusterKey(otherProduct));
    expect(groupEvidence([a, b, later, otherProduct])).toHaveLength(3);
  });

  it("does not cluster merely because two items mention the same model", () => {
    const runtime = evidence({
      evidenceId: "runtime",
      authorId: "one",
      sourceUrl: "https://github.com/modelcontextprotocol/servers/issues/1",
      title: "mcp-server-fetch fails to start on Claude",
    });
    const session = evidence({
      evidenceId: "session",
      authorId: "two",
      sourceUrl: "https://github.com/anthropics/claude-code/issues/2",
      repository: "anthropics/claude-code",
      product: "claude-code",
      normalizedTopic: "session-failure",
      title: "Claude Code cross-session messages silently dropped",
    });
    expect(clusterKey(runtime)).not.toBe(clusterKey(session));
    expect(groupEvidence([runtime, session])).toHaveLength(2);
  });

  it("publishes when three unique allowlisted authors and concurrent threads qualify", () => {
    const cluster = fixtures.examples.filter(
      (row) => row.cluster === "mcp-fetch"
    );
    const converted = cluster.map((row) => fromFixture(row));
    expect(converted.every((row) => !("rejected" in row))).toBe(true);
    const built = buildCommunitySignals(
      converted as DeveloperCommunityEvidence[]
    );
    expect(built).toHaveLength(1);
    expect(built[0]?.status).toBe("PUBLISH");
    expect(built[0]?.uniqueAuthorCount).toBeGreaterThanOrEqual(3);
    const items = buildDeveloperCommunityFeed(
      converted as DeveloperCommunityEvidence[]
    ).items;
    expect(items).toHaveLength(1);
    expect(items[0]?.source).toBe("Developer Community");
    expect(items[0]?.tags).toContain("developer-community");
    expect(items[0]?.tags).not.toContain("hackernews");
    expect(items[0]?.brief).toEqual({
      whatHappened: expect.any(String),
      whyItMatters: expect.any(String),
      potentialImpact: expect.any(String),
      keyTakeaway: expect.any(String),
    });
    expect(items[0]?.brief.keyTakeaway).toMatch(/github\.com\/modelcontextprotocol\/servers/);
  });

  it("treats two source families as an alternative to three unique authors", () => {
    const github = evidence({
      evidenceId: "gh",
      authorId: "jstar0",
      sourceUrl: "https://github.com/modelcontextprotocol/python-sdk/issues/3307",
      repository: "modelcontextprotocol/python-sdk",
      normalizedTopic: "reliability-transport",
      title: "Streamable HTTP reconnect exceeds retry budget",
    });
    const hn: DeveloperCommunityEvidence = {
      ...github,
      evidenceId: "hn",
      sourceFamily: "hn",
      sourceType: "hn-story",
      sourceUrl: "https://news.ycombinator.com/item?id=49088058",
      authorId: "hn-spec",
      repository: undefined,
    };
    const signal = buildCommunitySignals([github, hn])[0];
    expect(signal.sourceCount).toBe(2);
    expect(signal.uniqueAuthorCount).toBe(2);
    expect(signal.status).toBe("PUBLISH");
  });

  it("requires recurrence of 7 days or two independent threads", () => {
    const sameThread = [1, 2, 3].map((n) =>
      evidence({
        evidenceId: `same-${n}`,
        authorId: `a${n}`,
        sourceUrl: "https://github.com/cline/cline/issues/1",
        repository: "cline/cline",
        product: "cline",
        normalizedTopic: "tool-calling",
        createdAt: "2026-08-15T00:00:00.000Z",
      })
    );
    expect(qualifyCommunitySignal(groupEvidence(sameThread)[0]).status).toBe(
      "WATCH"
    );
    expect(qualifyCommunitySignal(groupEvidence(sameThread)[0]).reason).toBe(
      "insufficient-recurrence"
    );
    const concurrent = [1, 2, 3].map((n) =>
      evidence({
        evidenceId: `thread-${n}`,
        authorId: `a${n}`,
        sourceUrl: `https://github.com/cline/cline/issues/${n}`,
        repository: "cline/cline",
        product: "cline",
        normalizedTopic: "tool-calling",
        createdAt: "2026-08-15T00:00:00.000Z",
      })
    );
    expect(qualifyCommunitySignal(groupEvidence(concurrent)[0]).status).toBe(
      "PUBLISH"
    );
  });

  it("requires a concrete artifact and a product implication", () => {
    expect(hasConcreteArtifact("typo in readme")).toBe(false);
    expect(hasProductImplication("Update to TypeScript 7")).toBe(false);
    const noArtifact = [1, 2, 3].map((n) =>
      evidence({
        evidenceId: `docs-${n}`,
        authorId: `a${n}`,
        sourceUrl: `https://github.com/cline/cline/issues/${n}`,
        concreteArtifact: false,
        title: "please improve docs",
        bodySummary: "docs",
      })
    );
    expect(qualifyCommunitySignal(groupEvidence(noArtifact)[0]).reason).toBe(
      "no-concrete-artifact"
    );
    const noImplication = [1, 2, 3].map((n) =>
      evidence({
        evidenceId: `ime-${n}`,
        authorId: `a${n}`,
        sourceUrl: `https://github.com/anthropics/claude-code/issues/${n}`,
        productImplication: false,
        title: "IME composition scrambled",
      })
    );
    expect(qualifyCommunitySignal(groupEvidence(noImplication)[0]).reason).toBe(
      "no-product-implication"
    );
  });

  it("routes Watch, Review Queue, and cap 4 after qualification", () => {
    expect(PUBLISH_CAP).toBe(4);
    const make = (n: number): CommunitySignal => ({
      signalId: `s${n}`,
      topic: "mcp-runtime",
      signalType: "FRICTION",
      products: ["mcp"],
      summary: `signal ${n}`,
      evidence: [],
      firstSeenAt: `2026-08-0${n}T00:00:00.000Z`,
      lastSeenAt: `2026-08-1${n}T00:00:00.000Z`,
      sourceCount: 2,
      uniqueAuthorCount: 3,
      confidence: "high",
      productImplication: true,
      status: "PUBLISH",
    });
    const capped = applyCap(
      [make(1), make(2), make(3), make(4), make(5)],
      4
    );
    expect(capped.filter((row) => row.status === "PUBLISH")).toHaveLength(4);
    expect(capped.filter((row) => row.reason === "capped")).toHaveLength(1);
    expect(capped.find((row) => row.reason === "capped")?.status).toBe("WATCH");
    const backlash: CommunitySignal = {
      ...make(1),
      signalType: "BACKLASH",
      evidence: [
        evidence({
          evidenceId: "b",
          authorId: "x",
          sourceUrl: "https://news.ycombinator.com/item?id=1",
          sourceFamily: "hn",
          sourceType: "hn-story",
        }),
      ],
    };
    expect(qualifyCommunitySignal(backlash).status).toBe("WATCH");
    const isolated = qualifyCommunitySignal(
      groupEvidence([
        evidence({
          evidenceId: "iso",
          authorId: "solo",
          sourceUrl: "https://github.com/cline/cline/issues/9",
          concreteArtifact: false,
          productImplication: true,
        }),
      ])[0]
    );
    expect(isolated.status).toBe("REVIEW_QUEUE");
    const unknownTopic = qualifyCommunitySignal(
      groupEvidence([
        evidence({
          evidenceId: "unk1",
          authorId: "a1",
          sourceUrl: "https://github.com/cline/cline/issues/11",
          normalizedTopic: "other",
        }),
        evidence({
          evidenceId: "unk2",
          authorId: "a2",
          sourceUrl: "https://github.com/cline/cline/issues/12",
          normalizedTopic: "other",
        }),
        evidence({
          evidenceId: "unk3",
          authorId: "a3",
          sourceUrl: "https://github.com/cline/cline/issues/13",
          normalizedTopic: "other",
        }),
      ])[0]
    );
    expect(unknownTopic.status).toBe("REVIEW_QUEUE");
  });

  it("keeps HN stories as evidence and never emits them as direct cards", () => {
    const hn = fromFixture(fixtures.examples.find((row) => row.id === "4")!);
    expect("rejected" in hn).toBe(false);
    if ("rejected" in hn) return;
    const built = buildDeveloperCommunityFeed([hn]);
    expect(built.items).toHaveLength(0);
    expect(built.signals[0]?.status).toBe("WATCH");
    expect(built.signals[0]?.evidence[0]?.sourceFamily).toBe("hn");
  });

  it("never lets popularity override evidence requirements", () => {
    const hit = hnHitToEvidence({
      objectID: "qwen",
      title: "Qwen 3.8 27B",
      points: 1125,
      num_comments: 687,
      created_at: "2026-08-14T00:00:00.000Z",
      story_text: "New frontier model announcement.",
      author: "x",
    });
    expect("rejected" in hit).toBe(true);
    const stars = evidenceExclusion(
      "ECC has 240k stars so it must be the default agent harness",
      "Star inflation argument. No repro.",
      { stars: 240201, sourceFamily: "hn" }
    );
    expect(stars).toBe("star-inflation");
  });
});

describe("Developer Community V1 exclusions", () => {
  it("persists frozen exclusion reasons", () => {
    expect(evidenceExclusion("Show HN: ThoughtDAG", "", { sourceFamily: "hn" })).toBe(
      "show-hn-no-adoption"
    );
    expect(evidenceExclusion("We're hiring an AI intern", "")).toBe("job-post");
    expect(
      evidenceExclusion("LMSYS leaderboard argument", "arena elo, no repro")
    ).toBe("benchmark-argument");
    expect(
      evidenceExclusion("MCP Security", "TechCrunch-style roundup", {
        sourceFamily: "hn",
      })
    ).toBe("media-repost");
    expect(
      evidenceExclusion("How do I get started with MCP as a beginner?", "")
    ).toBe("beginner-support");
    expect(
      evidenceExclusion(
        "Windows: server fails to start when Node.js installed at default path",
        "",
        { sourceFamily: "github-issues" }
      )
    ).toBe("one-user-install");
    expect(
      evidenceExclusion("Why does Opus 5 feel worse to work with?", "hot take", {
        sourceFamily: "hn",
      })
    ).toBe("generic-opinion");
    expect(
      evidenceExclusion("I was banned from Claude for scaffolding a Claude.md file?", "")
    ).toBe("unsupported-claim");
    expect(evidenceExclusion("agent-coordination: hourly routine board", "", { comments: 2500 })).toBe(
      "agent-spam"
    );
  });
});

describe("Developer Community V1 frozen 28-example set", () => {
  it("keeps FAIL unpublished, BORDERLINE on Watch, and the MCP cluster on Publish", () => {
    expect(fixtures.examples.filter((row) => !row.cluster).length + 1).toBe(28);
    const pass = fixtures.examples.filter((row) => row.cluster === "mcp-fetch");
    const passEvidence = pass.map((row) => fromFixture(row));
    expect(passEvidence.every((row) => !("rejected" in row))).toBe(true);
    const published = buildCommunitySignals(
      passEvidence as DeveloperCommunityEvidence[]
    );
    expect(published.some((row) => row.status === "PUBLISH")).toBe(true);
    expect(
      buildDeveloperCommunityFeed(passEvidence as DeveloperCommunityEvidence[])
        .items
    ).toHaveLength(1);

    for (const example of fixtures.examples.filter((row) => !row.cluster)) {
      const converted = fromFixture(example);
      if (example.expected === "FAIL") {
        if ("rejected" in converted) {
          expect(converted.rejected).toBeTruthy();
          continue;
        }
        const status = buildCommunitySignals([converted])[0]?.status;
        expect(status).not.toBe("PUBLISH");
        expect(["REVIEW_QUEUE", "WATCH"]).toContain(status);
        continue;
      }
      if ("rejected" in converted) {
        throw new Error(
          `${example.id} expected ${example.expected} but was rejected (${converted.rejected})`
        );
      }
      const status = buildCommunitySignals([converted])[0]?.status;
      if (example.expected === "BORDERLINE") {
        expect(status, example.id).toBe("WATCH");
      }
      expect(status).not.toBe("PUBLISH");
    }
  });
});

describe("Developer Community V1 product helpers", () => {
  it("resolves allowlisted products and topics", () => {
    expect(resolveProduct({ repository: "vercel/ai", title: "x" })).toBe(
      "vercel-ai"
    );
    expect(normalizeTopic("mcp-server-fetch fails to start", "")).toBe(
      "mcp-runtime"
    );
    expect(
      candidateTypeFor("mcp-runtime", "mcp-server-fetch fails to start")
    ).toBe("FRICTION");
  });
});
