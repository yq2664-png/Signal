import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixtures from "@/lib/live/ranking/validation.fixtures.json";
import { PUBLISH_CAP as DC_CAP } from "@/lib/live/developer-community/config";
import { PUBLISH_CAP as RP_CAP } from "@/lib/live/research-paper/config";
import {
  applyIntraClassPreference,
  assignAttentionClass,
  assignRole,
  organizationOf,
  rankUnifiedFeed,
  topicOf,
} from "@/lib/live/ranking";
import type { FeedItem } from "@/lib/types";

type Fixture = (typeof fixtures.items)[number];

function asItem(row: Fixture, scores?: FeedItem["scores"]): FeedItem {
  const tags = [
    "live",
    ...(row.tags ?? []),
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
            model: "model" in row.officialLaunch ? row.officialLaunch.model : undefined,
            product:
              "product" in row.officialLaunch ? row.officialLaunch.product : undefined,
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

function pool(kind: "in" | "out" | "hold" = "in"): FeedItem[] {
  return fixtures.items.filter((row) => row.pool === kind).map((row) => asItem(row));
}

function windowOf(items: FeedItem[]) {
  const ranked = rankUnifiedFeed(items);
  return {
    ranked,
    top: ranked.items.slice(0, 10),
    ids: ranked.items.slice(0, 10).map((item) => item.id),
    annotations: ranked.annotations.slice(0, 10),
  };
}

describe("Unified Feed Ranking V1 roles and classes", () => {
  it("assigns Supply / Capability / Adoption / Background without reading scores", () => {
    const gpt = asItem(fixtures.items.find((row) => row.id === "ol-gpt-51")!);
    const mem0 = asItem(fixtures.items.find((row) => row.id === "rp-mem0")!);
    const mcp = asItem(fixtures.items.find((row) => row.id === "dc-mcp-cluster")!);
    const youtube: FeedItem = {
      ...mcp,
      id: "yt-1",
      source: "YouTube",
      tags: ["live"],
      officialLaunch: undefined,
      researchPaper: undefined,
    };
    expect(assignRole(gpt)).toBe("SUPPLY");
    expect(assignRole(mem0)).toBe("CAPABILITY");
    expect(assignRole(mcp)).toBe("ADOPTION");
    expect(assignRole(youtube)).toBe("BACKGROUND");
    expect(assignAttentionClass(gpt)).toBe("HIGH");
    expect(assignAttentionClass(mem0)).toBe("HIGH");
    expect(assignAttentionClass(mcp)).toBe("HIGH");
    expect(assignAttentionClass(youtube)).toBe("BACKGROUND");
    expect(assignAttentionClass(asItem(fixtures.items.find((row) => row.id === "ol-deepseek-update")!))).toBe(
      "MEDIUM"
    );
  });

  it("does not normalize or compare cross-pipeline scores", () => {
    const weakMcp = asItem(fixtures.items.find((row) => row.id === "dc-mcp-cluster")!, {
      impact: 1,
      relevance: 1,
      trend: 1,
    });
    const strongLaunch = asItem(fixtures.items.find((row) => row.id === "ol-gpt-51")!, {
      impact: 99,
      relevance: 99,
      trend: 99,
    });
    const mem0 = asItem(fixtures.items.find((row) => row.id === "rp-mem0")!, {
      impact: 2,
      relevance: 2,
      trend: 2,
    });
    const { ids, annotations } = windowOf([weakMcp, strongLaunch, mem0]);
    expect(ids).toEqual(["ol-gpt-51", "dc-mcp-cluster", "rp-mem0"]);
    expect(annotations.map((row) => row.role)).toEqual([
      "SUPPLY",
      "ADOPTION",
      "CAPABILITY",
    ]);
  });
});

describe("Unified Feed Ranking V1 diversity rules", () => {
  it("uses soft diversity and skip-empty rather than quotas", () => {
    const supplyOnly = pool("in").filter((item) => assignRole(item) === "SUPPLY");
    const { top, annotations } = windowOf(supplyOnly);
    expect(top.length).toBeGreaterThan(0);
    expect(annotations.every((row) => row.role === "SUPPLY")).toBe(true);
    expect(top.some((item) => assignRole(item) === "CAPABILITY")).toBe(false);
  });

  it("keeps max 2 consecutive same-role cards unless only breaking supply remains", () => {
    const { annotations } = windowOf(pool("in"));
    let streak = 1;
    for (let index = 1; index < annotations.length; index += 1) {
      if (annotations[index].role === annotations[index - 1].role) streak += 1;
      else streak = 1;
      if (streak > 2) {
        expect(annotations[index].breaking).toBe(true);
      }
    }
  });

  it("allows a breaking supply to continue a role streak when no other HIGH role exists", () => {
    const launches = pool("in").filter((item) => assignRole(item) === "SUPPLY");
    const ranked = rankUnifiedFeed(launches);
    expect(ranked.items.length).toBeGreaterThan(2);
    expect(assignRole(ranked.items[0])).toBe("SUPPLY");
    expect(assignRole(ranked.items[1])).toBe("SUPPLY");
    expect(assignRole(ranked.items[2])).toBe("SUPPLY");
  });

  it("prevents same-organization adjacency", () => {
    const { annotations } = windowOf(pool("in"));
    for (let index = 1; index < annotations.length; index += 1) {
      expect(annotations[index].organization).not.toBe(
        annotations[index - 1].organization
      );
    }
    const ids = annotations.map((row) => row.id);
    const gpt1 = ids.indexOf("ol-gpt-51");
    const gpt2 = ids.indexOf("ol-gpt-52");
    if (gpt1 >= 0 && gpt2 >= 0) {
      expect(Math.abs(gpt1 - gpt2)).toBeGreaterThan(1);
    }
  });

  it("spaces obvious same-topic cards when another item exists", () => {
    const { annotations } = windowOf(pool("in"));
    for (let index = 1; index < annotations.length; index += 1) {
      if (annotations[index].topic === annotations[index - 1].topic) {
        const alternative = annotations
          .slice(index)
          .some((row) => row.topic !== annotations[index].topic);
        expect(alternative).toBe(false);
      }
    }
    expect(topicOf(asItem(fixtures.items.find((row) => row.id === "dc-mcp-cluster")!))).toBe(
      "mcp-runtime"
    );
    expect(
      organizationOf(asItem(fixtures.items.find((row) => row.id === "ol-gpt-51")!))
    ).toBe("OpenAI");
  });
});

describe("Unified Feed Ranking V1 exclusions and preferences", () => {
  it("never promotes Watch / BORDERLINE / FAIL into the first 10", () => {
    const mixed = [...pool("in"), ...pool("out"), ...pool("hold")];
    const { ids, top } = windowOf(mixed);
    expect(ids).not.toContain("rp-convex");
    expect(ids).not.toContain("rp-quotebench");
    expect(ids).not.toContain("dc-qwen-hn");
    expect(ids).not.toContain("dc-show-hn");
    expect(ids).not.toContain("dc-memory-solo");
    expect(ids).not.toContain("ol-hiring");
    expect(top.every((item) => !item.tags.includes("watch"))).toBe(true);
    expect(top.every((item) => !item.tags.includes("fail"))).toBe(true);
  });

  it("applies like/save preference only ±1 seat within the same class", () => {
    const items = [
      asItem(fixtures.items.find((row) => row.id === "ol-gpt-51")!),
      asItem(fixtures.items.find((row) => row.id === "dc-mcp-cluster")!),
      asItem(fixtures.items.find((row) => row.id === "rp-mem0")!),
    ];
    const ranked = rankUnifiedFeed(items);
    const shifted = applyIntraClassPreference(ranked, new Set(["rp-mem0"]));
    expect(shifted.items[0].id).toBe("ol-gpt-51");
    expect(shifted.items.map((item) => item.id)).toContain("rp-mem0");
    const memIndex = shifted.items.findIndex((item) => item.id === "rp-mem0");
    const original = ranked.items.findIndex((item) => item.id === "rp-mem0");
    expect(original - memIndex).toBeLessThanOrEqual(1);
  });

  it("does not let likes move MEDIUM above HIGH", () => {
    const high = asItem(fixtures.items.find((row) => row.id === "ol-gpt-51")!);
    const medium = asItem(fixtures.items.find((row) => row.id === "ol-deepseek-update")!);
    const ranked = rankUnifiedFeed([medium, high]);
    expect(ranked.items[0].id).toBe("ol-gpt-51");
    const shifted = applyIntraClassPreference(ranked, new Set(["ol-deepseek-update"]));
    expect(shifted.items[0].id).toBe("ol-gpt-51");
    expect(assignAttentionClass(medium)).toBe("MEDIUM");
    expect(assignAttentionClass(high)).toBe("HIGH");
  });
});

describe("Unified Feed Ranking V1 frozen 36-item set", () => {
  it("preserves editorial principles on the mixed validation set", () => {
    expect(fixtures.items).toHaveLength(36);
    const mixed = fixtures.items.map((row) => asItem(row));
    const { ids, annotations, top } = windowOf(mixed);
    const roles = annotations.map((row) => row.role);
    expect(new Set(roles)).toEqual(new Set(["SUPPLY", "CAPABILITY", "ADOPTION"]));
    expect(ids).toContain("ol-gpt-51");
    expect(ids.some((id) => id.startsWith("dc-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("rp-"))).toBe(true);
    expect(ids[0]).not.toBe("ol-gpt-52");
    expect(top.filter((item) => assignRole(item) === "SUPPLY").length).toBeLessThanOrEqual(6);
    let streak = 1;
    for (let index = 1; index < annotations.length; index += 1) {
      if (annotations[index].role === annotations[index - 1].role) streak += 1;
      else streak = 1;
      if (streak > 2) expect(annotations[index].breaking).toBe(true);
    }
    for (let index = 1; index < annotations.length; index += 1) {
      expect(annotations[index].organization).not.toBe(annotations[index - 1].organization);
    }
    expect(ids).not.toContain("dc-qwen-hn");
    expect(ids).not.toContain("rp-bagging");
  });
});

describe("Unified Feed Ranking V1 contract guards", () => {
  it("leaves upstream RP and DC publication caps unchanged", () => {
    expect(RP_CAP).toBe(6);
    expect(DC_CAP).toBe(4);
  });

  it("does not re-sort the ranked API result in FeedPage", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/components/feed/FeedPage.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/sortFeedBoard/);
    expect(source).not.toMatch(/sortFeed\(/);
    expect(source).not.toMatch(/personalizationBoost/);
    expect(source).not.toMatch(/modelReleasePriority/);
    expect(source).not.toMatch(/contentQualityScore/);
  });
});
