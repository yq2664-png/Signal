import { describe, expect, it } from "vitest";
import {
  assessBriefReadiness,
  recoverOfficialLaunchEvidence,
  resolveBriefReadiness,
} from "@/lib/live/brief-readiness";
import { toFeedItem } from "@/lib/live/normalize";
import { shouldEnrichItem } from "@/lib/live/openai-enrich";
import batch03 from "@/lib/live/official-launch/batch-03.fixtures.json";
import enrichFixtures from "@/lib/live/official-launch/enrich.fixtures.json";
import {
  officialLaunchEventToFeedItem,
  officialLaunchEventToFeedItemReady,
} from "@/lib/live/official-launch/to-feed-item";
import type {
  OfficialLaunchEvent,
  OfficialLaunchSourceRecord,
} from "@/lib/types";

const KIMI_ARTICLE_URL = "https://www.kimi.ai/blog/kimi-k3";

function asSource(
  record: Record<string, unknown>
): OfficialLaunchSourceRecord {
  return {
    ...(record as Omit<OfficialLaunchSourceRecord, "originalContent">),
    originalContent: String(record.summary ?? ""),
  };
}

function kimiEvent(
  listing: Record<string, unknown>,
  extra?: Partial<OfficialLaunchEvent>
): OfficialLaunchEvent {
  const source = asSource(listing);
  return {
    eventId: String(listing.id ?? "kimi-k3"),
    organizationId: "moonshot",
    organizationName: "Kimi",
    tier: "core",
    eventType: "model-release",
    title: String(listing.title),
    summary: String(listing.summary),
    publishedAt: String(listing.publishedAt),
    entities: { company: "Moonshot", model: "Kimi K3" },
    capabilities: [],
    qualificationScore: 85,
    noveltyScore: 80,
    impactScore: 82,
    confidence: 0.9,
    primarySource: source,
    sources: [source],
    ...extra,
  };
}

const thinKimiListing = {
  id: "moonshot-home:kimi-k3",
  organizationId: "moonshot",
  channelId: "moonshot-home",
  sourceType: "blog",
  authority: 96,
  role: "primary",
  title: "Kimi K3",
  summary: "Kimi K3",
  url: KIMI_ARTICLE_URL,
  canonicalUrl: KIMI_ARTICLE_URL,
  publishedAt: "2026-07-16T12:00:00.000Z",
};

const htmlOk = async (url: string) => {
  expect(url).toBe(KIMI_ARTICLE_URL);
  return {
    url,
    status: 200,
    contentType: "text/html",
    body: enrichFixtures.kimiK3Article,
  };
};

const htmlFail = async () => {
  throw new Error("primary fetch failed");
};

describe("Brief Readiness fixtures", () => {
  it("FULL-rich → concrete Kimi/API evidence → full Brief", () => {
    const event = kimiEvent(batch03.moonshotK3);
    const assessment = assessBriefReadiness({
      title: event.title,
      summary: event.summary,
      entities: event.entities,
    });
    expect(assessment).toEqual({
      readiness: "full",
      reason: "sufficient-evidence",
    });
    const item = officialLaunchEventToFeedItem(event);
    expect(item.briefReadiness).toBe("full");
    expect(item.brief.whatHappened).toMatch(/Kimi K3/i);
    expect(item.brief.whyItMatters).toBeTruthy();
    expect(shouldEnrichItem(item)).toBe(true);
  });

  it("FULL-after-enrich → thin Kimi K3 listing → primary URL fetch succeeds → full", async () => {
    const event = kimiEvent(thinKimiListing);
    expect(
      assessBriefReadiness({
        title: event.title,
        summary: event.summary,
        entities: event.entities,
      }).readiness
    ).toBe("factual-only");

    const recovered = await recoverOfficialLaunchEvidence(event, htmlOk);
    expect(recovered.fetched).toBe(true);
    expect(recovered.recovered).toBe(true);
    expect(recovered.assessment).toEqual({
      readiness: "full",
      reason: "recovered-from-primary",
    });
    expect(recovered.summary).toMatch(/2\.8T-parameter|Kimi API|introducing/i);

    const item = await officialLaunchEventToFeedItemReady(event, htmlOk);
    expect(item.briefReadiness).toBe("full");
    expect(item.originalSummary).toMatch(/2\.8T-parameter|available today|Kimi API/i);
    expect(item.brief.whyItMatters).toBeTruthy();
    expect(shouldEnrichItem(item)).toBe(true);
  });

  it("FACTUAL-thin → Kimi K3, fetch fails → factual-only", async () => {
    const event = kimiEvent(thinKimiListing);
    const recovered = await recoverOfficialLaunchEvidence(event, htmlFail);
    expect(recovered.recovered).toBe(false);
    expect(recovered.assessment).toEqual({
      readiness: "factual-only",
      reason: "primary-fetch-failed",
    });

    const item = await officialLaunchEventToFeedItemReady(event, htmlFail);
    expect(item.briefReadiness).toBe("factual-only");
    expect(item.brief.whatHappened).toMatch(/Kimi published Kimi K3/i);
    expect(item.brief.whatHappened).toMatch(/2026-07-16/);
    expect(item.brief.whyItMatters).toBe("");
    expect(item.brief.potentialImpact).toBe("");
    expect(item.brief.keyTakeaway).toBe("");
    expect(item.brief.whyItMatters).not.toMatch(/trusted source feed/i);
    expect(shouldEnrichItem(item)).toBe(false);
  });

  it("NONE-x → GPT-5.6 looks interesting → none", () => {
    const assessment = assessBriefReadiness({
      title: "GPT-5.6 looks interesting",
      summary: "GPT-5.6 looks interesting",
      briefEligible: false,
    });
    expect(assessment).toEqual({
      readiness: "none",
      reason: "x-feed-only",
    });
    const item = toFeedItem({
      id: "x-named-no-evidence",
      title: "GPT-5.6 looks interesting",
      source: "X (Twitter)",
      publishedAt: "2026-09-03T12:00:00.000Z",
      category: "Industry Trends",
      summary: "GPT-5.6 looks interesting",
      url: "https://x.com/example/status/1",
      briefEligible: false,
    });
    expect(item.briefReadiness).toBe("none");
    expect(resolveBriefReadiness(item)).toBe("none");
    expect(item.brief.whatHappened).toBe("");
    expect(item.brief.whyItMatters).toBe("");
    expect(item.brief.potentialImpact).toBe("");
    expect(item.brief.keyTakeaway).toBe("");
    expect(shouldEnrichItem(item)).toBe(false);
  });

  it("RP/DC remain full", () => {
    const rp = toFeedItem({
      id: "arxiv-mem0",
      title: "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory",
      source: "arXiv",
      publishedAt: "2026-01-01T00:00:00.000Z",
      category: "Research Papers",
      summary: "Mem0 introduces a memory layer for agents.",
      url: "https://arxiv.org/abs/2501.00001",
      tags: ["live", "research-paper"],
    });
    expect(rp.briefReadiness).toBeUndefined();
    expect(resolveBriefReadiness(rp)).toBe("full");
    expect(rp.brief.whyItMatters).toBeTruthy();
    expect(shouldEnrichItem(rp)).toBe(false);

    const dc = toFeedItem({
      id: "dc-signal",
      title: "Agent workflows are dropping tool-call retries",
      source: "Developer Community",
      publishedAt: "2026-09-01T00:00:00.000Z",
      category: "Industry Trends",
      summary: "Multiple independent threads report pinning tool schemas.",
      url: "https://news.ycombinator.com/item?id=1",
      tags: ["live", "developer-community"],
    });
    expect(dc.briefReadiness).toBeUndefined();
    expect(resolveBriefReadiness(dc)).toBe("full");
    expect(dc.brief.whyItMatters).toBeTruthy();
  });
});

describe("evidence sufficiency is not word count", () => {
  it("rejects title-equals-summary even when the title is long", () => {
    expect(
      assessBriefReadiness({
        title: "Kimi K3 Open Frontier Intelligence",
        summary: "Kimi K3 Open Frontier Intelligence",
        entities: { company: "Moonshot", model: "Kimi K3" },
      })
    ).toEqual({
      readiness: "factual-only",
      reason: "title-equals-summary",
    });
  });

  it("rejects a product/model name with no verifiable change", () => {
    expect(
      assessBriefReadiness({
        title: "Introducing Kimi K3",
        summary: "Kimi K3",
        entities: { company: "Moonshot", model: "Kimi K3" },
      })
    ).toEqual({
      readiness: "factual-only",
      reason: "name-only",
    });
  });

  it("rejects generic marketing language", () => {
    expect(
      assessBriefReadiness({
        title: "Kimi K3",
        summary:
          "Kimi K3 aims to enhance intelligence and unlock new opportunities across domains.",
        entities: { company: "Moonshot", model: "Kimi K3" },
      })
    ).toEqual({
      readiness: "factual-only",
      reason: "marketing-only",
    });
  });
});

describe.skipIf(process.env.LIVE_KIMI !== "1")("live Kimi K3 article retry", () => {
  it("recovers full evidence from the primary Kimi K3 URL", async () => {
    const event = kimiEvent(thinKimiListing);
    const recovered = await recoverOfficialLaunchEvidence(event, async (url) => {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "SIGNAL-AI-Intelligence/0.1 (+brief-readiness-live)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(15_000),
      });
      return {
        url: response.url || url,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        body: await response.text(),
      };
    });
    expect(recovered.fetched).toBe(true);
    expect(recovered.recovered).toBe(true);
    expect(recovered.assessment).toEqual({
      readiness: "full",
      reason: "recovered-from-primary",
    });
    expect(recovered.summary).toMatch(/Kimi K3/i);
    expect(recovered.summary.length).toBeGreaterThan(event.summary.length);
    console.log(
      "[live-kimi]",
      recovered.assessment.reason,
      recovered.summary.slice(0, 600)
    );
  }, 20_000);
});
