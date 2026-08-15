import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/live/official-launch", () => ({
  fetchOfficialLaunchFeedItems: vi.fn(async () => ({
    data: [
      {
        id: "official-contract",
        title: "Introducing Contract Model",
        source: "OpenAI",
        publishedAt: "2026-08-01T12:00:00.000Z",
        category: "Model Releases",
        summary: "A model release used to verify the aggregate contract.",
        scores: { impact: 80, relevance: 85, trend: 78 },
        tier: "High Impact",
        tags: ["live", "official-launch", "core", "model-release"],
        url: "https://openai.com/index/contract-model",
        brief: {
          whatHappened: "OpenAI released Contract Model.",
          whyItMatters: "It preserves the shared FeedItem contract.",
          potentialImpact: "Feed and Insights can render the same object.",
          keyTakeaway: "No Official Launch-specific UI path is required.",
        },
        readingTimeMin: 1,
        officialLaunch: {
          eventId: "official-contract",
          eventType: "model-release",
          model: "Contract Model",
          supportingSources: [],
        },
      },
    ],
    errors: [],
    diagnosticsRunId: "contract-run",
  })),
}));
vi.mock("@/lib/live/research-paper", () => ({
  fetchResearchPaperFeedItems: vi.fn(async () => ({ data: [], errors: [] })),
}));
vi.mock("@/lib/live/developer-community", () => ({
  fetchDeveloperCommunityFeedItems: vi.fn(async () => ({
    data: [],
    errors: [],
  })),
}));
vi.mock("@/lib/live/rss", () => ({ fetchAllRss: vi.fn(async () => []) }));
vi.mock("@/lib/live/youtube", () => ({
  fetchYouTube: vi.fn(async () => []),
}));
vi.mock("@/lib/live/x", () => ({ fetchX: vi.fn(async () => []) }));
vi.mock("@/lib/live/github", () => ({
  fetchGitHubAll: vi.fn(async () => []),
}));
vi.mock("@/lib/live/openai-enrich", () => ({
  enrichFeedItems: vi.fn(async (items) => ({
    items,
    enrichedCount: 0,
    cacheHits: 0,
  })),
}));

import { getAggregatedFeed } from "@/lib/live/aggregate";

describe("Official Launch aggregate contract", () => {
  it("preserves FeedItem and Impact Brief fields through aggregation", async () => {
    const payload = await getAggregatedFeed();

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: "official-contract",
      source: "OpenAI",
      category: "Model Releases",
      tags: expect.arrayContaining(["official-launch"]),
      valueCue: "High Impact",
      brief: {
        whatHappened: expect.any(String),
        whyItMatters: expect.any(String),
        potentialImpact: expect.any(String),
        keyTakeaway: expect.any(String),
      },
      officialLaunch: {
        eventId: "official-contract",
        eventType: "model-release",
      },
    });
    expect(payload.meta).toMatchObject({
      liveCount: 1,
      enrichedCount: 0,
      enrichCacheHits: 0,
      errors: [],
    });
  });
});
