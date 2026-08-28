import { describe, expect, it } from "vitest";
import { isFrozenPipelineItem } from "@/lib/live/aggregate";
import type { FeedItem } from "@/lib/types";

function item(partial: Partial<FeedItem> & Pick<FeedItem, "id" | "source">): FeedItem {
  return {
    title: "Title",
    publishedAt: "2026-08-28T00:00:00.000Z",
    category: "Industry Trends",
    summary: "Summary",
    scores: { impact: 50, relevance: 50, trend: 50 },
    tier: "Emerging",
    tags: [],
    url: "https://example.com",
    brief: {
      whatHappened: "x",
      whyItMatters: "y",
      potentialImpact: "z",
      keyTakeaway: "k",
    },
    readingTimeMin: 1,
    ...partial,
  };
}

describe("isFrozenPipelineItem", () => {
  it("keeps Official Launch, Research Paper, and Developer Community cards", () => {
    expect(
      isFrozenPipelineItem(
        item({
          id: "ol",
          source: "OpenAI",
          officialLaunch: {
            eventId: "e1",
            eventType: "model-release",
            supportingSources: [],
          },
        })
      )
    ).toBe(true);
    expect(
      isFrozenPipelineItem(
        item({
          id: "rp",
          source: "arXiv",
          researchPaper: {
            arxivId: "2401.00001",
          },
        })
      )
    ).toBe(true);
    expect(
      isFrozenPipelineItem(item({ id: "dc", source: "Developer Community" }))
    ).toBe(true);
  });

  it("lets RSS, X, YouTube, and GitHub recrawl on pull-to-refresh", () => {
    expect(isFrozenPipelineItem(item({ id: "rss", source: "Tech Blog" }))).toBe(false);
    expect(isFrozenPipelineItem(item({ id: "x", source: "X (Twitter)" }))).toBe(false);
    expect(isFrozenPipelineItem(item({ id: "yt", source: "YouTube" }))).toBe(false);
    expect(isFrozenPipelineItem(item({ id: "gh", source: "GitHub · Projects" }))).toBe(
      false
    );
  });
});
