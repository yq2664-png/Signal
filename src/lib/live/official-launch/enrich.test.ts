import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import batch03 from "@/lib/live/official-launch/batch-03.fixtures.json";
import fixtures from "@/lib/live/official-launch/enrich.fixtures.json";
import { OfficialLaunchDiagnosticsCollector } from "@/lib/live/official-launch/diagnostics";
import {
  ENRICHMENT_FETCH_CAP,
  ENRICHMENT_MAX_CHARS,
  composeEnrichmentSummary,
  parseEnrichmentHtml,
  shouldTriggerEnrichment,
  type EnrichmentFetchHtml,
} from "@/lib/live/official-launch/enrich";
import { getOfficialLaunchOrganization } from "@/lib/live/official-launch/config";
import { deterministicExtract } from "@/lib/live/official-launch/extract";
import { buildOfficialLaunchEvents } from "@/lib/live/official-launch";
import { officialLaunchEventsToFeedItems } from "@/lib/live/official-launch/to-feed-item";
import type { OfficialLaunchSourceRecord } from "@/lib/types";

const moonshot = getOfficialLaunchOrganization("moonshot")!;
const minimax = getOfficialLaunchOrganization("minimax")!;
const prime = getOfficialLaunchOrganization("prime-intellect")!;

function asRecord(
  record: Record<string, unknown>
): OfficialLaunchSourceRecord {
  return {
    ...(record as Omit<OfficialLaunchSourceRecord, "originalContent">),
    originalContent: String(record.summary ?? ""),
  };
}

function padHtml(html: string): string {
  const pad = "<!-- " + "p".repeat(2_200) + " -->";
  return `${html}${pad}`;
}

function htmlMap(
  mapping: Record<string, string>
): (url: string) => Promise<{
  url: string;
  status: number;
  contentType: string;
  body: string;
}> {
  return async (url) => {
    const body = mapping[url];
    if (!body) {
      throw new Error(`unexpected enrichment fetch: ${url}`);
    }
    return {
      url,
      status: 200,
      contentType: "text/html",
      body: padHtml(body),
    };
  };
}

function composedSummary(
  html: string,
  listing: OfficialLaunchSourceRecord,
  seekAvailability = false
): string {
  return composeEnrichmentSummary(parseEnrichmentHtml(html)!, {
    listingTitle: listing.title,
    seekAvailability,
  });
}

async function run(
  records: OfficialLaunchSourceRecord[],
  fetchHtml: EnrichmentFetchHtml,
  organizations = [moonshot, minimax, prime]
) {
  const diagnostics = new OfficialLaunchDiagnosticsCollector(records.length);
  const events = await buildOfficialLaunchEvents(records, {
    organizations,
    persistDiagnostics: false,
    diagnostics,
    enrichmentFetch: fetchHtml,
  });
  return { events, diagnostics, items: officialLaunchEventsToFeedItems(events) };
}

describe("Candidate Enrichment", () => {
  beforeEach(async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv(
      "CACHE_DIR",
      await mkdtemp(path.join(tmpdir(), "official-launch-enrich-"))
    );
  });

  afterEach(async () => {
    const cacheDir = process.env.CACHE_DIR;
    vi.unstubAllEnvs();
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  });

  it("does not treat hyphen-only known products as digit-bearing enrichment triggers", () => {
    const listing = asRecord({
      id: "prime-intellect-blog:prime-rl-notes",
      organizationId: "prime-intellect",
      channelId: "prime-intellect-blog",
      sourceType: "blog",
      authority: 94,
      role: "primary",
      title: "Multi-Agent Systems in PRIME-RL",
      summary: "Multi-Agent Systems in PRIME-RL",
      url: "https://www.primeintellect.ai/blog/multi-agent-systems",
      canonicalUrl: "https://www.primeintellect.ai/blog/multi-agent-systems",
      publishedAt: "2026-08-07T12:00:00.000Z",
    });
    expect(shouldTriggerEnrichment(listing, prime).eligible).toBe(false);
  });

  it("does not pass nav, H1 generic phrasing, or later sections into the lead window", () => {
    const listing = asRecord(fixtures.minimaxH3Listing);
    const parsed = parseEnrichmentHtml(fixtures.minimaxH3Article);
    const summary = composedSummary(fixtures.minimaxH3Article, listing);
    expect(parsed).not.toBeNull();
    expect(summary.length).toBeLessThanOrEqual(ENRICHMENT_MAX_CHARS);
    expect(summary).toMatch(/launching MiniMax H3/i);
    expect(summary).not.toMatch(/Open Model/i);
    expect(summary).not.toMatch(/\bnew\b/i);
    expect(summary).not.toMatch(/\bapi\b/i);
    expect(summary).not.toMatch(/partnership|students/i);
  });

  it("publishes Kimi K3 as Kimi K3 and drops GPT 5.6 comparison text", async () => {
    const listing = asRecord(fixtures.kimiK3Listing);
    expect(deterministicExtract(listing, moonshot)).toBeNull();
    const summary = composedSummary(fixtures.kimiK3Article, listing);
    expect(summary).not.toMatch(/GPT 5\.6/i);
    expect(summary).not.toMatch(/Kimi Code/i);
    const extracted = deterministicExtract({ ...listing, summary }, moonshot);
    expect(extracted?.entities.model).toBe("Kimi K3");
    expect(extracted?.entities.product).toBe("Kimi K3");
    const { events, items, diagnostics } = await run(
      [listing],
      htmlMap({ [listing.url]: fixtures.kimiK3Article }),
      [moonshot]
    );
    expect(events).toHaveLength(1);
    expect(items).toHaveLength(1);
    expect(events[0].entities.model).toBe("Kimi K3");
    expect(events[0].title).toBe(listing.title);
    expect(events[0].qualificationScore).toBeGreaterThanOrEqual(78);
    expect(events[0].noveltyScore).toBeGreaterThanOrEqual(68);
    expect(events[0].impactScore).toBeGreaterThanOrEqual(68);
    expect(
      diagnostics.finish(1).candidates.find(
        (candidate) => candidate.stage === "enrichment"
      )
    ).toMatchObject({
      enrichmentTriggered: true,
      enrichmentFetchSuccess: true,
      qualificationBeforeEnrichment: false,
      qualificationAfterEnrichment: true,
    });
  });

  it("publishes MiniMax M3 from the release lead and ignores later bugfix copy", async () => {
    const listing = asRecord(fixtures.minimaxM3Listing);
    expect(deterministicExtract(listing, minimax)).toBeNull();
    const summary = composedSummary(fixtures.minimaxM3Article, listing);
    expect(summary).toMatch(/released today/i);
    expect(summary).not.toMatch(/bugfix/i);
    const { events, items } = await run(
      [listing],
      htmlMap({ [listing.url]: fixtures.minimaxM3Article }),
      [minimax]
    );
    expect(events).toHaveLength(1);
    expect(items).toHaveLength(1);
    expect(events[0].entities.model).toBe("MiniMax M3");
    expect(events[0].title).toBe(listing.title);
    expect(events[0].summary).not.toMatch(/bugfix/i);
    expect(events[0].noveltyScore).toBeGreaterThanOrEqual(68);
  });

  it("qualifies MiniMax H3 without copying Open Model H1 and still fails Emerging novelty", async () => {
    const listing = asRecord(fixtures.minimaxH3Listing);
    expect(deterministicExtract(listing, minimax)).toBeNull();
    const summary = composedSummary(fixtures.minimaxH3Article, listing);
    expect(summary).not.toMatch(/Open Model/i);
    const { events, diagnostics } = await run(
      [listing],
      htmlMap({ [listing.url]: fixtures.minimaxH3Article }),
      [minimax]
    );
    expect(
      diagnostics.finish(0).candidates.find(
        (candidate) => candidate.stage === "enrichment"
      )
    ).toMatchObject({
      enrichmentTriggered: true,
      qualificationBeforeEnrichment: false,
      qualificationAfterEnrichment: true,
    });
    const extracted = deterministicExtract({ ...listing, summary }, minimax);
    expect(extracted).not.toBeNull();
    expect(extracted!.entities.model).toBe("MiniMax H3");
    expect(extracted!.noveltyScore).toBeLessThan(minimax.publishThresholds.novelty);
    expect(events).toEqual([]);
  });

  it("does not invent availability for MiniMax Music 3.0 and does not publish it", async () => {
    const listing = asRecord(fixtures.minimaxMusicListing);
    expect(deterministicExtract(listing, minimax)).toBeNull();
    expect(shouldTriggerEnrichment(listing, minimax).eligible).toBe(true);
    const summary = composedSummary(fixtures.minimaxMusicArticle, listing, true);
    expect(summary).not.toMatch(/\bapi\b/i);
    expect(summary).not.toMatch(/\bavailable\b/i);
    const { events, diagnostics } = await run(
      [listing],
      htmlMap({ [listing.url]: fixtures.minimaxMusicArticle }),
      [minimax]
    );
    expect(
      diagnostics.finish(0).candidates.find(
        (candidate) => candidate.stage === "enrichment"
      )
    ).toMatchObject({
      qualificationBeforeEnrichment: false,
      qualificationAfterEnrichment: false,
    });
    expect(
      deterministicExtract({ ...listing, summary }, minimax)
    ).toBeNull();
    expect(events).toEqual([]);
  });

  it("enriches INTELLECT-3 when the listing candidate is present", async () => {
    const listing = asRecord(batch03.primeIntellect3Listing);
    expect(deterministicExtract(listing, prime)).toBeNull();
    const { events, diagnostics } = await run(
      [listing],
      htmlMap({ [listing.url]: fixtures.intellect3Article }),
      [prime]
    );
    expect(
      diagnostics.finish(0).candidates.find(
        (candidate) => candidate.stage === "enrichment"
      )
    ).toMatchObject({
      enrichmentTriggered: true,
      qualificationAfterEnrichment: true,
    });
    const extracted = deterministicExtract(
      {
        ...listing,
        summary: parseEnrichmentHtml(fixtures.intellect3Article)!.text,
      },
      prime
    );
    expect(extracted).not.toBeNull();
    expect(extracted!.noveltyScore).toBeLessThan(prime.publishThresholds.novelty);
    expect(events).toEqual([]);
  });

  it("does not invent INTELLECT-3 when the listing window omitted it", async () => {
    const windowRecords = Array.from({ length: 12 }, (_, index) =>
      asRecord({
        id: `prime-intellect-blog:window-${index}`,
        organizationId: "prime-intellect",
        channelId: "prime-intellect-blog",
        sourceType: "blog",
        authority: 94,
        role: "primary",
        title: `Weekly research notes ${index + 1}`,
        summary: `Weekly research notes ${index + 1}`,
        url: `https://www.primeintellect.ai/blog/notes-${index + 1}`,
        canonicalUrl: `https://www.primeintellect.ai/blog/notes-${index + 1}`,
        publishedAt: "2026-08-01T12:00:00.000Z",
      })
    );
    const fetchHtml = vi.fn(async (url: string) => {
      throw new Error(`should not fetch ${url}`);
    });
    const { events } = await run(windowRecords, fetchHtml, [prime]);
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(
      events.some((event) => event.entities.model === "INTELLECT-3")
    ).toBe(false);
    expect(events).toEqual([]);
  });

  it("still rejects a true bugfix changelog and does not enrich it", async () => {
    const record = asRecord(fixtures.bugfixChangelog);
    expect(deterministicExtract(record, minimax)).toBeNull();
    expect(shouldTriggerEnrichment(record, minimax)).toMatchObject({
      eligible: false,
      skipReason: "not-sparse",
    });
    const fetchHtml = vi.fn(htmlMap({}));
    const { events } = await run([record], fetchHtml, [minimax]);
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("never triggers enrichment for excluded partnership content", async () => {
    const listing = asRecord(fixtures.partnershipListing);
    expect(shouldTriggerEnrichment(listing, prime).eligible).toBe(false);
    const fetchHtml = vi.fn(htmlMap({}));
    const { events, diagnostics } = await run([listing], fetchHtml, [prime]);
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(
      diagnostics.finish(0).candidates.find(
        (candidate) => candidate.stage === "enrichment"
      )
    ).toMatchObject({
      enrichmentTriggered: false,
      enrichmentSkipped: true,
      error: "excluded-content-type",
    });
  });

  it("reuses a cached article and does not refetch", async () => {
    const listing = asRecord(fixtures.kimiK3Listing);
    const fetchHtml = vi.fn(
      htmlMap({ [listing.url]: fixtures.kimiK3Article })
    );
    const first = await run([listing], fetchHtml, [moonshot]);
    const second = await run([listing], fetchHtml, [moonshot]);
    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(1);
    expect(
      second.diagnostics.finish(1).candidates.find(
        (candidate) => candidate.stage === "enrichment"
      )
    ).toMatchObject({
      enrichmentCacheHit: true,
      enrichmentFetchSuccess: false,
      qualificationAfterEnrichment: true,
    });
  });

  it("does not fetch off-host URLs", async () => {
    const listing = asRecord({
      ...fixtures.minimaxM3Listing,
      url: "https://huggingface.co/MiniMax/M3",
      canonicalUrl: "https://huggingface.co/minimax/m3",
    });
    expect(shouldTriggerEnrichment(listing, minimax).eligible).toBe(false);
    const fetchHtml = vi.fn(htmlMap({}));
    await run([listing], fetchHtml, [minimax]);
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it("caps extra fetches at eight per organization", async () => {
    const records = Array.from({ length: ENRICHMENT_FETCH_CAP + 1 }, (_, index) =>
      asRecord({
        id: `minimax-blog:cap-${index}`,
        organizationId: "minimax",
        channelId: "minimax-blog",
        sourceType: "blog",
        authority: 94,
        role: "primary",
        title: `MiniMax M3 listing ${index + 1}`,
        summary: `MiniMax M3 listing ${index + 1}`,
        url: `https://www.minimax.io/blog/minimax-m3-cap-${index + 1}`,
        canonicalUrl: `https://www.minimax.io/blog/minimax-m3-cap-${index + 1}`,
        publishedAt: "2026-06-01T12:00:00.000Z",
      })
    );
    const fetchHtml = vi.fn(async (url: string) => ({
      url,
      status: 200,
      contentType: "text/html",
      body: padHtml(fixtures.minimaxM3Article),
    }));
    const { diagnostics } = await run(records, fetchHtml, [minimax]);
    expect(fetchHtml).toHaveBeenCalledTimes(ENRICHMENT_FETCH_CAP);
    const enrichment = diagnostics
      .finish(0)
      .candidates.filter((candidate) => candidate.stage === "enrichment");
    expect(
      enrichment.filter((candidate) => candidate.error === "cap")
    ).toHaveLength(1);
  });

  it("falls back to the original listing when the page is an SPA shell", async () => {
    const listing = asRecord(fixtures.minimaxH3Listing);
    const fetchHtml = vi.fn(async (url: string) => ({
      url,
      status: 200,
      contentType: "text/html",
      body: fixtures.spaShell,
    }));
    const { events, diagnostics } = await run([listing], fetchHtml, [minimax]);
    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
    expect(deterministicExtract(listing, minimax)).toBeNull();
    expect(
      diagnostics.finish(0).candidates.find(
        (candidate) => candidate.stage === "enrichment"
      )
    ).toMatchObject({
      enrichmentTriggered: true,
      enrichmentFetchFailure: true,
      enrichmentSkipped: true,
      qualificationAfterEnrichment: false,
      error: "spa-or-insufficient-text",
    });
  });

  it("keeps one Event as one Feed card after enrichment", async () => {
    const listing = asRecord(fixtures.kimiK3Listing);
    const { events, items } = await run(
      [listing],
      htmlMap({ [listing.url]: fixtures.kimiK3Article }),
      [moonshot]
    );
    expect(events).toHaveLength(1);
    expect(items).toHaveLength(1);
    expect(items[0].officialLaunch?.eventId).toBe(events[0].eventId);
    expect(items.map((item) => item.id)).toEqual(
      events.map((event) => event.eventId)
    );
  });
});
