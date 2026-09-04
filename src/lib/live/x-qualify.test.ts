import { describe, expect, it } from "vitest";
import { qualifyXPost } from "@/lib/live/x-qualify";
import { toFeedItem } from "@/lib/live/normalize";
import { shouldEnrichItem } from "@/lib/live/openai-enrich";
import { assignAttentionClass, assignRole } from "@/lib/live/ranking";

const FIXTURES = [
  {
    id: "promo-bundle",
    text: "premium help you... grammarly plus spotify... chatgpt...",
    decision: "reject",
    reason: "promo-spam",
  },
  {
    id: "generic-ai",
    text: "AI is changing everything!",
    decision: "reject",
    reason: "generic-commentary",
  },
  {
    id: "dm-bait",
    text: 'Follow me + DM "GPT" for free ChatGPT Plus / Claude Pro',
    decision: "reject",
    reason: "promo-spam",
  },
  {
    id: "named-no-evidence",
    text: "GPT-5.6 looks interesting",
    decision: "feed-only",
    reason: "named-entity-insufficient-evidence",
  },
  {
    id: "sentiment-only",
    text: "Claude is so good lol",
    decision: "feed-only",
    reason: "named-entity-insufficient-evidence",
  },
  {
    id: "implementation-evidence",
    text: "After migrating our agent workflow to [tool], tool-call failures dropped from 18% to 3%; we stopped retrying mid-turn and pinned the schema.",
    decision: "feed-brief",
    reason: "concrete-evidence",
  },
  {
    id: "prod-capability",
    text: "Shipped GPT-4o-mini vision in prod today: p95 caption latency 1.2s → 420ms after batching image tiles. Notes: …",
    decision: "feed-brief",
    reason: "concrete-evidence",
  },
  {
    id: "repro-product-change",
    text: "New: Claude Code now keeps MCP tool state across reconnects. Repro: kill the transport mid-call, session resumes without re-auth.",
    decision: "feed-brief",
    reason: "concrete-evidence",
  },
  {
    id: "hot-take",
    text: "Unpopular opinion: agents are overhyped",
    decision: "reject",
    reason: "generic-commentary",
  },
  {
    id: "keyword-stuffing",
    text: "ChatGPT ChatGPT Claude Gemini AI tools AI tools 🔥",
    decision: "reject",
    reason: "keyword-stuffing",
  },
] as const;

function itemFor(text: string, briefEligible?: boolean) {
  return toFeedItem({
    id: "x-fixture",
    title: text.slice(0, 110),
    source: "X (Twitter)",
    publishedAt: "2026-09-03T12:00:00.000Z",
    category: "Industry Trends",
    summary: text,
    url: "https://x.com/example/status/1",
    briefEligible,
  });
}

describe("qualifyXPost fixtures", () => {
  it.each(FIXTURES)("$id → $decision / $reason", (fixture) => {
    expect(qualifyXPost(fixture.text)).toEqual({
      decision: fixture.decision,
      reason: fixture.reason,
    });
  });

  it("does not use engagement as a hard gate", () => {
    expect(qualifyXPost.length).toBe(1);
    expect(qualifyXPost("GPT-5.6 looks interesting").decision).toBe("feed-only");
    expect(
      qualifyXPost(
        "After migrating our agent workflow to [tool], tool-call failures dropped from 18% to 3%; we stopped retrying mid-turn and pinned the schema."
      ).decision
    ).toBe("feed-brief");
  });
});

describe("X brief eligibility wiring", () => {
  it("keeps generic Impact Brief copy when briefEligible is omitted", () => {
    const item = itemFor("OpenAI shipped a model");
    expect(item.briefEligible).toBeUndefined();
    expect(item.brief.whyItMatters).toMatch(/trusted source feed/i);
  });

  it("does not invent analytical copy for FEED_ONLY", () => {
    const text = "GPT-5.6 looks interesting";
    expect(qualifyXPost(text).decision).toBe("feed-only");
    const item = itemFor(text, false);
    expect(item.briefEligible).toBe(false);
    expect(item.brief.whatHappened).toBe("");
    expect(item.brief.whyItMatters).toBe("");
    expect(item.brief.potentialImpact).toBe("");
    expect(item.brief.keyTakeaway).toBe("");
    expect(shouldEnrichItem(item)).toBe(false);
  });

  it("allows a Brief for FEED_BRIEF items", () => {
    const text =
      "Shipped GPT-4o-mini vision in prod today: p95 caption latency 1.2s → 420ms after batching image tiles. Notes: …";
    expect(qualifyXPost(text).decision).toBe("feed-brief");
    const item = itemFor(text, true);
    expect(item.briefEligible).toBe(true);
    expect(item.brief.whatHappened).toBeTruthy();
    expect(shouldEnrichItem(item)).toBe(true);
  });

  it("keeps qualified X items as BACKGROUND outside the attention window", () => {
    const item = itemFor(
      "Shipped GPT-4o-mini vision in prod today: p95 caption latency 1.2s → 420ms after batching image tiles. Notes: …",
      true
    );
    expect(assignRole(item)).toBe("BACKGROUND");
    expect(assignAttentionClass(item)).toBe("BACKGROUND");
  });
});
