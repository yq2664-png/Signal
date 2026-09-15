import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { fetchArxivByIds, parseArxivPage } from "./arxiv-atom";
import { retainResearchOnFailure } from "./last-good";
import type { FeedItem } from "@/lib/types";
let dir: string;
const html = '<meta name="citation_arxiv_id" content="2609.14858"><meta name="citation_title" content="An AI paper"><meta name="citation_date" content="2026/09/14"><meta name="citation_author" content="Author"><meta property="og:description" content="We present an autonomous agent that learns to perform complex tasks using observations and memory in realistic environments.">';
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "arxiv-recovery-")); vi.stubEnv("CACHE_DIR", dir); });
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(dir, { recursive: true, force: true }); });
it("recovers from API rate limiting using the matching official page and reuses it", async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response("rate limited", { status: 429 })).mockResolvedValueOnce(new Response(html)); vi.stubGlobal("fetch", request);
  const results = await fetchArxivByIds(["2609.14858"]);
  expect(results[0].title).toBe("An AI paper"); expect(results[0].authors).toEqual(["Author"]);
  expect(await fetchArxivByIds(["2609.14858"])).toEqual(results);
  expect(request).toHaveBeenCalledTimes(2);
});
it("rejects mismatched and incomplete metadata", () => {
  expect(parseArxivPage(html, "2609.00001")).toBeUndefined();
  expect(parseArxivPage("<title>Access denied</title>", "2609.14858")).toBeUndefined();
});
it("retains recent published papers during an outage but expires old ones", async () => {
  const item = { id: "paper", publishedAt: "2026-09-14T00:00:00Z", researchPaper: { arxivId: "2609.14858" } } as FeedItem;
  const opts = { degraded: false, now: new Date("2026-09-15T00:00:00Z"), cap: 6, windowDays: 7 };
  await retainResearchOnFailure([item], opts);
  expect(await retainResearchOnFailure([], { ...opts, degraded: true })).toEqual([item]);
  expect(await retainResearchOnFailure([], { ...opts, degraded: true, now: new Date("2026-09-23T00:00:00Z") })).toEqual([]);
});
