import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPayload } from "@/lib/live/aggregate";
import {
  FEED_TTL_MS,
  getCachedFeed,
  resetFeedCacheForTests,
} from "@/lib/live/feed-cache";

function samplePayload(title = "Live item"): FeedPayload {
  return {
    items: [
      {
        id: "sample",
        title,
        source: "OpenAI",
        publishedAt: "2026-08-27T00:00:00.000Z",
        category: "Model Releases",
        summary: "A cached feed item.",
        scores: { impact: 80, relevance: 80, trend: 80 },
        tier: "High Impact",
        tags: ["live"],
        url: "https://openai.com/index/sample",
        brief: {
          whatHappened: "It shipped.",
          whyItMatters: "It matters.",
          potentialImpact: "Products can use it.",
          keyTakeaway: "Read the card.",
        },
        readingTimeMin: 1,
      },
    ],
    insights: [],
    meta: {
      liveCount: 1,
      enrichedCount: 0,
      enrichCacheHits: 0,
      fetchedAt: "2026-08-27T00:00:00.000Z",
      errors: [],
    },
  };
}

describe("getCachedFeed request budget", () => {
  let dir: string;
  let previousCacheDir: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "feed-cache-"));
    previousCacheDir = process.env.CACHE_DIR;
    process.env.CACHE_DIR = dir;
    resetFeedCacheForTests();
  });

  afterEach(() => {
    resetFeedCacheForTests();
    if (previousCacheDir === undefined) delete process.env.CACHE_DIR;
    else process.env.CACHE_DIR = previousCacheDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a warming payload instead of waiting out a slow crawl", async () => {
    const fetchFresh = vi.fn(
      () =>
        new Promise<FeedPayload>(() => {
          /* hang past Railway's proxy budget */
        })
    );

    const started = Date.now();
    const payload = await getCachedFeed(fetchFresh);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(4_000);
    expect(payload.meta.warming).toBe(true);
    expect(payload.items).toEqual([]);
    expect(fetchFresh).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent cold fetches", async () => {
    const fetchFresh = vi.fn(
      () =>
        new Promise<FeedPayload>(() => {
          /* hang */
        })
    );

    await Promise.all([getCachedFeed(fetchFresh), getCachedFeed(fetchFresh)]);
    expect(fetchFresh).toHaveBeenCalledOnce();
  });

  it("serves a disk snapshot immediately and refreshes stale data in the background", async () => {
    writeFileSync(
      path.join(dir, "feed-snapshot.json"),
      JSON.stringify({
        fetchedAt: new Date(Date.now() - FEED_TTL_MS - 60_000).toISOString(),
        payload: samplePayload("Cached launch"),
      })
    );

    const fetchFresh = vi.fn(
      () =>
        new Promise<FeedPayload>(() => {
          /* hang */
        })
    );

    const started = Date.now();
    const payload = await getCachedFeed(fetchFresh);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(payload.meta.warming).toBe(false);
    expect(payload.meta.fromCache).toBe(true);
    expect(payload.items[0]?.title).toBe("Cached launch");
    expect(fetchFresh).toHaveBeenCalledOnce();
  });

  it("rewrites cached changelog markdown URLs to HTML docs pages", async () => {
    writeFileSync(
      path.join(dir, "feed-snapshot.json"),
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        payload: {
          ...samplePayload("Claude changelog"),
          items: [
            {
              ...samplePayload().items[0],
              title: "Claude changelog",
              url: "https://docs.anthropic.com/en/release-notes/overview.md#august-19-2026",
            },
          ],
        },
      })
    );

    const payload = await getCachedFeed(async () => samplePayload());
    expect(payload.items[0]?.url).toBe(
      "https://docs.anthropic.com/en/release-notes/overview#august-19-2026"
    );
  });

  it("does not block force refresh when a snapshot already exists", async () => {
    const first = await getCachedFeed(async () => samplePayload("First"));
    expect(first.meta.warming).toBe(false);

    const fetchFresh = vi.fn(
      () =>
        new Promise<FeedPayload>(() => {
          /* hang */
        })
    );
    const forced = await getCachedFeed(fetchFresh, { force: true });

    expect(forced.items[0]?.title).toBe("First");
    expect(forced.meta.fromCache).toBe(true);
    expect(fetchFresh).toHaveBeenCalledOnce();
  });
});
