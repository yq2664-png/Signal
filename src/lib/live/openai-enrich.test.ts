import { afterEach, expect, it, vi } from "vitest";
import type { FeedItem } from "@/lib/types";
import { cleanHeadline, shouldEnrichItem, supportedHeadline } from "./openai-enrich";
const item = {
  id: "release", title: "Acme launches Model A", originalTitle: "Introducing Model A",
  originalSummary: "In our tests, Model A scores 72% on SWE-bench Verified versus Model B at 68%.",
  summary: "A new model", tags: ["ai-headline"], briefReadiness: "full",
} as FeedItem;
afterEach(() => vi.unstubAllEnvs());
it("allows upgrading old headlines once but skips the current version", () => {
  expect(shouldEnrichItem(item)).toBe(true);
  expect(shouldEnrichItem({ ...item, tags: ["ai-headline", "ai-headline-v4"] })).toBe(false);
  expect(shouldEnrichItem({ ...item, originalTitle: undefined })).toBe(false);
  expect(shouldEnrichItem({ ...item, tags: ["research-paper"] })).toBe(false);
});
it("accepts a headline with a quote from the original source", () => {
  const title = "Acme says Model A beats Model B on SWE-bench Verified";
  expect(supportedHeadline(title, item.originalSummary, item)).toBe(title);
});
it("rejects invented evidence and generated summaries as evidence", () => {
  expect(supportedHeadline("Model A beats Model C", "Model C scores 60%", item)).toBe(item.originalTitle);
  expect(supportedHeadline("Model A beats Model C", "A new model", item)).toBe(item.originalTitle);
  expect(supportedHeadline("Model A leads all benchmarks", "", item)).toBe(item.originalTitle);
});
it("does not truncate the benchmark or attribution at the end of a headline", () => {
  const title = "Acme releases Model A for coding; the company reports stronger results than Model B on SWE-bench Verified";
  expect(cleanHeadline(title, item.title)).toBe(title);
  expect(cleanHeadline("a".repeat(161), item.title)).toBe(item.title);
});
