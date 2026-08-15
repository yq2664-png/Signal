import { describe, expect, it } from "vitest";
import type { RankedFeed } from "@/lib/live/ranking";
import { insightForItem } from "@/lib/surface/insight-link";
import { presentBrief } from "@/lib/surface/present-brief";
import { attachValueCues } from "@/lib/surface/value-cue";
import type { FeedItem, Insight } from "@/lib/types";

function item(id: string, extra: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    title: id,
    source: "OpenAI",
    publishedAt: "2026-08-15T00:00:00.000Z",
    category: "Model Releases",
    summary: "Summary",
    scores: { impact: 80, relevance: 80, trend: 80 },
    tier: "High Impact",
    tags: ["live"],
    url: "https://example.com",
    brief: {
      whatHappened: "Happened",
      whyItMatters: "Matters",
      potentialImpact: "Impact",
      keyTakeaway: "Takeaway",
    },
    readingTimeMin: 2,
    ...extra,
  };
}

describe("attachValueCues", () => {
  it("preserves ranked order and stamps qualified cues only", () => {
    const a = item("a", { tags: ["official-launch"] });
    const b = item("b", { tags: ["research-paper"], source: "arXiv" });
    const c = item("c", { tags: ["developer-community"], source: "Developer Community" });
    const d = item("d", { tags: ["live"], source: "YouTube" });
    const ranked: RankedFeed = {
      items: [a, b, c, d],
      annotations: [
        {
          id: "a",
          role: "SUPPLY",
          attentionClass: "HIGH",
          organization: "openai",
          topic: "a",
          breaking: true,
          label: "High Impact",
          reason: "x",
          diversityRules: [],
        },
        {
          id: "b",
          role: "CAPABILITY",
          attentionClass: "MEDIUM",
          organization: "arxiv",
          topic: "b",
          breaking: false,
          label: "Trending",
          reason: "x",
          diversityRules: [],
        },
        {
          id: "c",
          role: "ADOPTION",
          attentionClass: "HIGH",
          organization: "claude-code",
          topic: "c",
          breaking: false,
          label: "Developer Signal",
          reason: "x",
          diversityRules: [],
        },
        {
          id: "d",
          role: "BACKGROUND",
          attentionClass: "BACKGROUND",
          organization: "youtube",
          topic: "d",
          breaking: false,
          label: "Trending",
          reason: "x",
          diversityRules: [],
        },
      ],
    };

    const items = attachValueCues(ranked);
    expect(items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
    expect(items[0].valueCue).toBe("High Impact");
    expect(items[1].valueCue).toBe("New Capability");
    expect(items[2].valueCue).toBe("Developer Signal");
    expect(items[3].valueCue).toBeUndefined();
  });
});

describe("presentBrief", () => {
  it("drops template chrome and repeated fields without inventing copy", () => {
    const presented = presentBrief({
      whatHappened: "Kimi released K2.5. 4 independent authors across 7 evidence records.",
      whyItMatters:
        "This item was ingested from a trusted source feed. A structured triage template is shown when the AI enrichment layer is unavailable.",
      potentialImpact: "Kimi released K2.5.",
      keyTakeaway:
        "Skim the source, then decide: track, pilot, or ignore — starting from “Kimi K2.5”. https://kimi.com/blog",
    });
    expect(presented.whatHappened).toContain("Kimi released K2.5");
    expect(presented.whatHappened).not.toMatch(/independent authors/);
    expect(presented.whyItMatters).toBe("");
    expect(presented.potentialImpact).toBe("");
    expect(presented.keyTakeaway).toBe("");
  });

  it("keeps distinct DC why-care copy", () => {
    const presented = presentBrief({
      whatHappened: "Install and platform setup is blocking adoption.",
      whyItMatters:
        "This is a recurring friction pattern over 3 day(s), not a single complaint.",
      potentialImpact:
        "Product, UX, or agent-workflow assumptions may need to change around reliability, tool use, or session behavior.",
      keyTakeaway: "Test or watch opencode https://github.com/x/y",
    });
    expect(presented.whyItMatters).toMatch(/recurring friction pattern/);
    expect(presented.potentialImpact).toMatch(/agent-workflow/);
    expect(presented.keyTakeaway).toBe("Test or watch opencode");
  });
});

describe("insightForItem", () => {
  it("matches existing evidence object ids only", () => {
    const insight = {
      insightId: "insight-coding-agent-onboarding",
      evidence: [{ objectId: "dc-opencode-install-platform-1476" }],
    } as Insight;
    expect(
      insightForItem(
        item("dc-opencode-install-platform-1476", {
          source: "Developer Community",
        }),
        [insight]
      )?.insightId
    ).toBe("insight-coding-agent-onboarding");
    expect(
      insightForItem(item("unrelated-card"), [insight])
    ).toBeUndefined();
  });
});
