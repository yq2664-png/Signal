import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { FeedPayload } from "./aggregate";
import type { FeedItem } from "@/lib/types";
const service = vi.hoisted(() => ({ getFeedTranslations: vi.fn() }));
vi.mock("./feed-translations", () => service);
let dir: string;
const item = { id: "one", title: "Original", summary: "Summary", brief: { whatHappened: "Fact", whyItMatters: "", potentialImpact: "", keyTakeaway: "" } } as FeedItem;
const feed = (post = item): FeedPayload => ({ items: [post], meta: { fetchedAt: "2026-09-14T00:00:00Z", liveCount: 1, enrichedCount: 0, enrichCacheHits: 0, errors: [] } });
let ready: string[];
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); ready = ["en", "zh"];
  dir = await mkdtemp(path.join(tmpdir(), "signal-publish-")); vi.stubEnv("CACHE_DIR", dir);
  service.getFeedTranslations.mockImplementation(async (items: FeedItem[], locale: string) => ({
    readyIds: ready.includes(locale) ? items.map(i => i.id) : [],
    translations: Object.fromEntries(items.map(i => [i.id, { title: `${locale}:${i.title}`, summary: `${locale}:${i.summary}`, brief: { ...i.brief, whatHappened: `${locale}:Fact` } }])),
  }));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
it("only publishes complete bilingual revisions, retaining the previous revision on failure", async () => {
  const { publishBilingualFeed } = await import("./feed-publication");
  const first = await publishBilingualFeed(feed());
  expect(first.items[0].translations?.zh?.brief?.whatHappened).toBe("zh:Fact");
  ready = ["en"];
  const partial = await publishBilingualFeed(feed({ ...item, title: "Changed" }));
  expect(partial.items[0].title).toBe("Original");
  expect(partial.meta.translationPending).toBe(1);
  ready = ["en", "zh"];
  const complete = await publishBilingualFeed(feed({ ...item, title: "Changed" }));
  expect(complete.items[0].translations?.zh?.title).toBe("zh:Changed");
  expect(complete.meta.translationPending).toBe(0);
  expect(service.getFeedTranslations.mock.calls.every(call => call[2] === true)).toBe(true);
});
it("holds new posts until both languages are ready, then restores publication after restart", async () => {
  let publisher = await import("./feed-publication");
  ready = ["en"];
  expect((await publisher.publishBilingualFeed(feed())).items).toHaveLength(0);
  ready.push("zh"); await publisher.publishBilingualFeed(feed());
  vi.resetModules(); publisher = await import("./feed-publication"); ready = [];
  const restored = await publisher.publishBilingualFeed(feed());
  expect(restored.items[0].translations?.en?.title).toBe("en:Original");
});
it("enqueues both locales in the background, independent of selected UI language", async () => {
  const { prepareBilingualFeed } = await import("./feed-publication");
  await prepareBilingualFeed(feed());
  expect(service.getFeedTranslations).toHaveBeenCalledWith([item], "en");
  expect(service.getFeedTranslations).toHaveBeenCalledWith([item], "zh");
});
