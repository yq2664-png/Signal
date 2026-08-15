import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixtures from "@/lib/live/ranking/ranking-v1.1.fixtures.json";
import v1Fixtures from "@/lib/live/ranking/validation.fixtures.json";
import {
  assignAttentionClass,
  assignBusinessTier,
  assignRole,
  isBreakingSupply,
  isModelAvailable,
  organizationOf,
  rankUnifiedFeed,
} from "@/lib/live/ranking";
import type { FeedItem } from "@/lib/types";

type Row = (typeof fixtures.items)[number];

function asItem(row: Row, scores?: FeedItem["scores"]): FeedItem {
  const tags = [
    "live",
    ...("tags" in row && row.tags ? row.tags : []),
    "officialLaunch" in row && row.officialLaunch ? "official-launch" : "",
    "researchPaper" in row && row.researchPaper ? "research-paper" : "",
  ].filter(Boolean);
  return {
    id: row.id,
    title: row.title,
    source: row.source as FeedItem["source"],
    publishedAt: row.publishedAt,
    category: row.category as FeedItem["category"],
    summary: row.title,
    scores: scores ?? { impact: 50, relevance: 50, trend: 50 },
    tier: "Emerging",
    tags,
    url: `https://example.test/${row.id}`,
    brief: {
      whatHappened: row.title,
      whyItMatters: "fixture",
      potentialImpact: "fixture",
      keyTakeaway: "fixture",
    },
    readingTimeMin: 1,
    officialLaunch:
      "officialLaunch" in row && row.officialLaunch
        ? {
            eventId: row.officialLaunch.eventId,
            eventType: row.officialLaunch.eventType as NonNullable<
              FeedItem["officialLaunch"]
            >["eventType"],
            model:
              "model" in row.officialLaunch ? row.officialLaunch.model : undefined,
            product:
              "product" in row.officialLaunch
                ? row.officialLaunch.product
                : undefined,
            supportingSources: [],
          }
        : undefined,
    researchPaper:
      "researchPaper" in row && row.researchPaper
        ? {
            arxivId: row.researchPaper.arxivId,
            relevanceCue: row.researchPaper.relevanceCue as
              | FeedItem["researchPaper"] extends { relevanceCue?: infer Cue }
              ? Cue
              : never,
          }
        : undefined,
    native: "native" in row ? row.native : undefined,
  };
}

function byId(id: string): FeedItem {
  const row = fixtures.items.find((item) => item.id === id);
  if (!row) throw new Error(`missing fixture ${id}`);
  return asItem(row);
}

function t1Launch(
  id: string,
  source: FeedItem["source"],
  title: string,
  publishedAt: string,
  model: string
): FeedItem {
  return {
    ...byId("ol-gpt-51-standard"),
    id,
    source,
    title,
    publishedAt,
    officialLaunch: {
      eventId: id,
      eventType: "model-release",
      model,
      supportingSources: [],
    },
  };
}

describe("Unified Feed Ranking V1.1 business-tier classifier", () => {
  it("A. open-weight foundation model is T1 even when typed open-source-release", () => {
    const item = byId("ol-kimi-k25-oss");
    expect(assignRole(item)).toBe("SUPPLY");
    expect(item.officialLaunch?.eventType).toBe("open-source-release");
    expect(isModelAvailable(item)).toBe(true);
    expect(assignBusinessTier(item)).toBe("T1");
    expect(isBreakingSupply(item)).toBe(true);
    expect(assignAttentionClass(item)).toBe("HIGH");
  });

  it("B. standard model-release is T1", () => {
    const item = byId("ol-gpt-51-standard");
    expect(assignBusinessTier(item)).toBe("T1");
    expect(assignAttentionClass(item)).toBe("HIGH");
  });

  it("C. first-party product-launch is T2, never T1", () => {
    for (const id of ["ol-build-mode", "ol-muse-av", "ol-sign-language"]) {
      const item = byId(id);
      expect(assignRole(item)).toBe("SUPPLY");
      expect(assignBusinessTier(item)).toBe("T2");
      expect(isModelAvailable(item)).toBe(false);
      expect(assignAttentionClass(item)).toBe("HIGH");
    }
  });

  it("does not treat a Grok product or sign-language model as T1", () => {
    const bot = byId("ol-grok-bot");
    expect(bot.officialLaunch?.eventType).toBe("model-release");
    expect(assignBusinessTier(bot)).toBe("T2");
    expect(isModelAvailable(bot)).toBe(false);

    const sign = {
      ...byId("ol-sign-language"),
      officialLaunch: {
        eventId: "ol-sign-language",
        eventType: "model-release" as const,
        product: "SL2T",
        model: "SL2T",
        supportingSources: [],
      },
    };
    expect(assignBusinessTier(sign)).toBe("T2");
    expect(isModelAvailable(sign)).toBe(false);

    const shield = byId("ol-shieldstral-v11");
    expect(shield.source).toBe("Mistral AI");
    expect(assignBusinessTier(shield)).toBe("T2");
    expect(isModelAvailable(shield)).toBe(false);
  });

  it("D. Developer Community repo friction is Adoption, never T2", () => {
    const item = byId("dc-opencode-install-v11");
    expect(assignRole(item)).toBe("ADOPTION");
    expect(assignBusinessTier(item)).toBeUndefined();
    expect(assignAttentionClass(item)).toBe("HIGH");
  });

  it("E. Research Paper is Capability, never T1/T2", () => {
    const item = byId("rp-matraix-v11");
    expect(assignRole(item)).toBe("CAPABILITY");
    expect(assignBusinessTier(item)).toBeUndefined();
    expect(assignAttentionClass(item)).toBe("HIGH");
  });

  it("F. generic OSS project is not T1", () => {
    const toolkit = byId("ol-search-toolkit-oss");
    expect(assignRole(toolkit)).toBe("SUPPLY");
    expect(toolkit.officialLaunch?.eventType).toBe("open-source-release");
    expect(assignBusinessTier(toolkit)).toBeUndefined();
    expect(isModelAvailable(toolkit)).toBe(false);
    expect(assignAttentionClass(toolkit)).toBe("MEDIUM");

    const github = byId("gh-star-project");
    expect(assignRole(github)).toBe("BACKGROUND");
    expect(assignBusinessTier(github)).toBeUndefined();
    expect(assignAttentionClass(github)).toBe("BACKGROUND");
  });

  it("rejects Announcement and recap residue as T1/T2", () => {
    const announcement = byId("ol-announcement");
    expect(announcement.source).toBe("OpenAI");
    expect(announcement.officialLaunch?.eventType).toBe("model-release");
    expect(assignBusinessTier(announcement)).toBeUndefined();
    expect(isBreakingSupply(announcement)).toBe(false);
    expect(assignAttentionClass(announcement)).toBe("MEDIUM");

    const recap = byId("ol-july-recap");
    expect(assignBusinessTier(recap)).toBeUndefined();
    expect(assignAttentionClass(recap)).toBe("MEDIUM");
  });
});

describe("Unified Feed Ranking V1.1 attention window", () => {
  it("G. same-org T1 releases do not sit adjacent", () => {
    const items = [
      t1Launch("ol-a", "OpenAI", "Introducing GPT-5.1", "2026-08-02T12:00:00.000Z", "GPT-5.1"),
      t1Launch("ol-b", "OpenAI", "Introducing GPT-5.2", "2026-08-03T12:00:00.000Z", "GPT-5.2"),
      t1Launch(
        "ol-c",
        "Anthropic",
        "Introducing Claude Sonnet 5",
        "2026-08-01T12:00:00.000Z",
        "Claude Sonnet 5"
      ),
      byId("dc-opencode-install-v11"),
      byId("rp-matraix-v11"),
    ];
    const ranked = rankUnifiedFeed(items);
    const window = ranked.annotations.slice(0, 10);
    for (let index = 1; index < window.length; index += 1) {
      expect(window[index].organization).not.toBe(window[index - 1].organization);
    }
    const openai = window.filter((row) => row.organization === "OpenAI");
    expect(openai.length).toBe(2);
    const first = window.findIndex((row) => row.id === "ol-b");
    const second = window.findIndex((row) => row.id === "ol-a");
    expect(Math.abs(first - second)).toBeGreaterThan(1);
  });

  it("H. ten T1 releases cannot consume all first-10 seats when HIGH Adoption and Capability exist", () => {
    const labs: Array<[FeedItem["source"], string, string]> = [
      ["OpenAI", "Introducing GPT-5.1", "GPT-5.1"],
      ["Anthropic", "Introducing Claude Opus 5", "Claude Opus 5"],
      ["Google DeepMind", "Introducing Gemini 3.7 Flash", "Gemini 3.7 Flash"],
      ["Meta AI", "Introducing Llama 4 Scout", "Llama 4 Scout"],
      ["xAI", "Introducing Grok 4.6", "Grok 4.6"],
      ["DeepSeek", "Introducing DeepSeek-V4", "DeepSeek-V4"],
      ["Qwen", "Introducing Qwen3", "Qwen3"],
      ["Mistral AI", "Introducing Mistral Large 4", "Mistral Large 4"],
      ["Kimi", "Introducing Kimi K3", "Kimi K3"],
      ["MiniMax", "Introducing MiniMax M3", "MiniMax M3"],
    ];
    const items = [
      ...labs.map(([source, title, model], index) =>
        t1Launch(
          `ol-t1-${index}`,
          source,
          title,
          `2026-08-${String(15 - index).padStart(2, "0")}T12:00:00.000Z`,
          model
        )
      ),
      byId("dc-opencode-install-v11"),
      byId("rp-matraix-v11"),
    ];
    const ranked = rankUnifiedFeed(items);
    const window = ranked.annotations.slice(0, 10);
    const roles = window.map((row) => row.role);
    expect(roles).toContain("ADOPTION");
    expect(roles).toContain("CAPABILITY");
    expect(roles.filter((role) => role === "SUPPLY").length).toBeLessThan(10);
    expect(window.some((row) => row.id === "dc-opencode-install-v11")).toBe(true);
    expect(window.some((row) => row.id === "rp-matraix-v11")).toBe(true);
    expect(window[0]?.businessTier).toBe("T1");
  });

  it("I. empty HIGH Capability does not promote a weak paper into the window", () => {
    const labs: Array<[FeedItem["source"], string, string]> = [
      ["OpenAI", "Introducing GPT-5.1", "GPT-5.1"],
      ["Anthropic", "Introducing Claude Opus 5", "Claude Opus 5"],
      ["Google DeepMind", "Introducing Gemini 3.7 Flash", "Gemini 3.7 Flash"],
      ["Meta AI", "Introducing Llama 4 Scout", "Llama 4 Scout"],
      ["xAI", "Introducing Grok 4.6", "Grok 4.6"],
      ["DeepSeek", "Introducing DeepSeek-V4", "DeepSeek-V4"],
      ["Qwen", "Introducing Qwen3", "Qwen3"],
      ["Mistral AI", "Introducing Mistral Large 4", "Mistral Large 4"],
      ["Kimi", "Introducing Kimi K3", "Kimi K3"],
      ["MiniMax", "Introducing MiniMax M3", "MiniMax M3"],
    ];
    const secondAdoption: FeedItem = {
      ...byId("dc-opencode-install-v11"),
      id: "dc-claude-session-v11",
      title: "claude-code: session state is dropping across turns",
      publishedAt: "2026-08-15T09:00:00.000Z",
      tags: [
        "live",
        "developer-community",
        "friction",
        "session-failure",
        "claude-code",
      ],
      native: {
        authorName: "claude-code",
        subtitle: "FRICTION · 9 evidence · 3d",
        comments: 9,
      },
    };
    const items = [
      ...labs.map(([source, title, model], index) =>
        t1Launch(
          `ol-i-${index}`,
          source,
          title,
          `2026-08-${String(15 - index).padStart(2, "0")}T12:00:00.000Z`,
          model
        )
      ),
      byId("dc-opencode-install-v11"),
      secondAdoption,
      byId("rp-unimomo-medium"),
    ];
    expect(assignAttentionClass(byId("rp-unimomo-medium"))).toBe("MEDIUM");
    const ranked = rankUnifiedFeed(items);
    const ids = ranked.items.slice(0, 10).map((item) => item.id);
    expect(ids).not.toContain("rp-unimomo-medium");
    expect(ids).toContain("dc-opencode-install-v11");
    expect(
      ranked.annotations.slice(0, 10).some((row) => row.role === "CAPABILITY")
    ).toBe(false);
  });

  it("J. max-two-consecutive-role still holds when T1 is preferred", () => {
    const secondAdoption: FeedItem = {
      ...byId("dc-opencode-install-v11"),
      id: "dc-claude-session-j",
      title: "claude-code: session state is dropping across turns",
      publishedAt: "2026-08-15T09:00:00.000Z",
      tags: [
        "live",
        "developer-community",
        "friction",
        "session-failure",
        "claude-code",
      ],
      native: {
        authorName: "claude-code",
        subtitle: "FRICTION · 9 evidence · 3d",
        comments: 9,
      },
    };
    const mixed = [
      byId("ol-kimi-k25-oss"),
      byId("ol-gpt-51-standard"),
      byId("ol-build-mode"),
      byId("dc-opencode-install-v11"),
      secondAdoption,
      byId("rp-matraix-v11"),
      t1Launch(
        "ol-gemini",
        "Google DeepMind",
        "Introducing Gemini 3.7 Flash",
        "2026-08-07T12:00:00.000Z",
        "Gemini 3.7 Flash"
      ),
      t1Launch(
        "ol-claude",
        "Anthropic",
        "Introducing Claude Opus 5",
        "2026-08-06T12:00:00.000Z",
        "Claude Opus 5"
      ),
    ];
    const ranked = rankUnifiedFeed(mixed);
    const window = ranked.annotations.slice(0, 10);
    let streak = 1;
    for (let index = 1; index < window.length; index += 1) {
      if (window[index].role === window[index - 1].role) streak += 1;
      else streak = 1;
      if (streak > 2) expect(window[index].breaking).toBe(true);
    }
  });

  it("does not apply a lab prestige bonus when recency is equal", () => {
    const openai = {
      ...t1Launch(
        "ol-openai-tied",
        "OpenAI",
        "Introducing GPT-5.1",
        "2026-08-15T12:00:00.000Z",
        "GPT-5.1"
      ),
      scores: { impact: 40, relevance: 40, trend: 40 },
    };
    const minimax = {
      ...t1Launch(
        "ol-minimax-tied",
        "MiniMax",
        "Introducing MiniMax M3",
        "2026-08-15T12:00:00.000Z",
        "MiniMax M3"
      ),
      scores: { impact: 90, relevance: 80, trend: 80 },
    };
    const ranked = rankUnifiedFeed([
      openai,
      minimax,
      byId("dc-opencode-install-v11"),
      byId("rp-matraix-v11"),
    ]);
    expect(ranked.items[0].id).toBe("ol-minimax-tied");
  });

  it("keeps T2 behind T1 for remaining Supply seats", () => {
    const ranked = rankUnifiedFeed([
      byId("ol-kimi-k25-oss"),
      byId("ol-build-mode"),
      byId("dc-opencode-install-v11"),
      byId("rp-matraix-v11"),
    ]);
    const supply = ranked.annotations.filter((row) => row.role === "SUPPLY");
    expect(supply[0]?.businessTier).toBe("T1");
    expect(supply.some((row) => row.businessTier === "T2")).toBe(true);
    const t2Index = ranked.annotations.findIndex((row) => row.businessTier === "T2");
    const t1Index = ranked.annotations.findIndex((row) => row.businessTier === "T1");
    expect(t1Index).toBeGreaterThanOrEqual(0);
    expect(t2Index).toBeGreaterThan(t1Index);
  });
});

describe("Unified Feed Ranking V1.1 contract guards", () => {
  it("does not revive engagement, prestige, or global-score ranking", () => {
    const rank = readFileSync(
      path.resolve(process.cwd(), "src/lib/live/ranking/rank.ts"),
      "utf8"
    );
    const tier = readFileSync(
      path.resolve(process.cwd(), "src/lib/live/ranking/business-tier.ts"),
      "utf8"
    );
    const attention = readFileSync(
      path.resolve(process.cwd(), "src/lib/live/ranking/attention.ts"),
      "utf8"
    );
    const combined = rank + tier + attention;
    expect(combined).not.toMatch(/sourceWeight/);
    expect(combined).not.toMatch(/contentQualityScore/);
    expect(combined).not.toMatch(/modelReleasePriority/);
    expect(combined).not.toMatch(/stargazers/);
    expect(combined).not.toMatch(/native\?\.stars/);
    expect(combined).not.toMatch(/native\?\.points/);
    expect(combined).not.toMatch(/native\?\.likes/);
    expect(combined).not.toMatch(/native\?\.views/);
    expect(combined).not.toMatch(/official-launch\/extract/);
    expect(v1Fixtures.items).toHaveLength(36);
  });

  it("does not assign T1/T2 outside Supply", () => {
    const adoption = byId("dc-opencode-install-v11");
    const paper = byId("rp-matraix-v11");
    const github = byId("gh-star-project");
    expect(organizationOf(adoption)).toBe("opencode");
    expect(assignBusinessTier(adoption)).toBeUndefined();
    expect(assignBusinessTier(paper)).toBeUndefined();
    expect(assignBusinessTier(github)).toBeUndefined();
  });
});
