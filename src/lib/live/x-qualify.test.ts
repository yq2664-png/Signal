import { describe, expect, it } from "vitest";
import {
  qualifyXPost,
  shouldPublishXToFeed,
} from "@/lib/live/x-qualify";
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
    id: "claude-person",
    text: "Claude Jarman blue light glasses 30% off today",
    decision: "reject",
    reason: "ambiguous-entity",
  },
  {
    id: "gemini-astrology",
    text: "Gemini season is going to be wild this year",
    decision: "reject",
    reason: "ambiguous-entity",
  },
  {
    id: "grok-casual",
    text: "@grok what do you think about this?",
    decision: "reject",
    reason: "conversational-noise",
  },
  {
    id: "brand-argument",
    text: "OpenAI sucks, Claude clears",
    decision: "reject",
    reason: "conversational-noise",
  },
  {
    id: "keyword-stuffing",
    text: "ChatGPT ChatGPT Claude Gemini AI tools AI tools 🔥",
    decision: "reject",
    reason: "keyword-stuffing",
  },
  {
    id: "hot-take",
    text: "Unpopular opinion: agents are overhyped",
    decision: "reject",
    reason: "generic-commentary",
  },
  {
    id: "named-no-evidence",
    text: "GPT-6 Astra's scores are really impressive",
    decision: "feed-only",
    reason: "insufficient-evidence",
  },
  {
    id: "claude-code-opinion",
    text: "Claude Code looks much better now",
    decision: "feed-only",
    reason: "insufficient-evidence",
  },
  {
    id: "gemini-flash-feel",
    text: "Gemini Flash feels faster today",
    decision: "feed-only",
    reason: "insufficient-evidence",
  },
  {
    id: "implementation-evidence",
    text: "After migrating our agent workflow to [tool], tool-call failures dropped from 18% to 3%; we stopped retrying mid-turn and pinned the schema.",
    decision: "feed-brief",
    reason: "first-hand-implementation",
  },
  {
    id: "prod-capability",
    text: "Shipped GPT-X vision in prod today. p95 caption latency dropped from 1.2s to 420ms after batching image tiles.",
    decision: "feed-brief",
    reason: "first-hand-implementation",
  },
  {
    id: "repro-product-change",
    text: "Claude Code now keeps MCP tool state across reconnects. Repro: kill the transport mid-call; the session resumes without re-auth.",
    decision: "feed-brief",
    reason: "reproducible-behavior",
  },
  {
    id: "support-agent-cost",
    text: "We moved our support agent from Model A to Model B this week. Cost per resolved ticket fell 31%, while escalation rate stayed flat.",
    decision: "feed-brief",
    reason: "first-hand-implementation",
  },
  {
    id: "gemini-api-test",
    text: "Gemini API now exposes streaming tool results. Tested it against our existing workflow; here are the before/after results: p95 1.8s → 640ms.",
    decision: "feed-brief",
    reason: "first-hand-implementation",
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
    expect(shouldPublishXToFeed(qualifyXPost(fixture.text))).toBe(
      fixture.decision === "feed-brief"
    );
  });

  it("does not use engagement as a hard gate", () => {
    expect(qualifyXPost.length).toBe(1);
    const weak = "GPT-6 Astra's scores are really impressive";
    const strong =
      "After migrating our agent workflow to [tool], tool-call failures dropped from 18% to 3%; we stopped retrying mid-turn and pinned the schema.";
    expect(qualifyXPost(weak).decision).toBe("feed-only");
    expect(qualifyXPost(strong).decision).toBe("feed-brief");
  });

  it("keeps high-engagement weak posts out of the main Feed", () => {
    const verdict = qualifyXPost("GPT-6 Astra's scores are really impressive");
    expect(verdict.decision).toBe("feed-only");
    expect(shouldPublishXToFeed(verdict)).toBe(false);
  });

  it("publishes zero-engagement first-hand evidence", () => {
    const verdict = qualifyXPost(
      "Shipped GPT-X vision in prod today. p95 caption latency dropped from 1.2s to 420ms after batching image tiles."
    );
    expect(verdict.decision).toBe("feed-brief");
    expect(shouldPublishXToFeed(verdict)).toBe(true);
  });

  it("does not globally reject replies that contain concrete evidence", () => {
    const verdict = qualifyXPost(
      "@teammate After migrating our agent workflow to [tool], tool-call failures dropped from 18% to 3% after we pinned the schema.",
      { isReply: true }
    );
    expect(verdict.decision).toBe("feed-brief");
  });

  it("rejects a short reply that only names Claude", () => {
    expect(qualifyXPost("@uday_devops Claude", { isReply: true })).toEqual({
      decision: "reject",
      reason: "conversational-noise",
    });
  });
});

describe("X feed admission wiring", () => {
  it("keeps generic Impact Brief copy when briefEligible is omitted", () => {
    const item = itemFor("OpenAI shipped a model");
    expect(item.briefEligible).toBeUndefined();
    expect(item.brief.whyItMatters).toMatch(/trusted source feed/i);
  });

  it("does not invent analytical copy or publish WATCH items", () => {
    const text = "GPT-6 Astra's scores are really impressive";
    expect(qualifyXPost(text).decision).toBe("feed-only");
    expect(shouldPublishXToFeed(qualifyXPost(text))).toBe(false);
    const item = itemFor(text, false);
    expect(item.briefEligible).toBe(false);
    expect(item.brief.whatHappened).toBe("");
    expect(item.brief.whyItMatters).toBe("");
    expect(item.brief.potentialImpact).toBe("");
    expect(item.brief.keyTakeaway).toBe("");
    expect(shouldEnrichItem(item)).toBe(false);
  });

  it("allows a Brief for PUBLISH items and keeps them BACKGROUND", () => {
    const text =
      "Shipped GPT-X vision in prod today. p95 caption latency dropped from 1.2s to 420ms after batching image tiles.";
    expect(qualifyXPost(text).decision).toBe("feed-brief");
    const item = itemFor(text, true);
    expect(item.briefEligible).toBe(true);
    expect(item.brief.whatHappened).toBeTruthy();
    expect(shouldEnrichItem(item)).toBe(true);
    expect(assignRole(item)).toBe("BACKGROUND");
    expect(assignAttentionClass(item)).toBe("BACKGROUND");
  });
});
