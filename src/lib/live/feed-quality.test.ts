import { expect, it } from "vitest";
import { enforceFeedQuality, isRelevantYouTube } from "./feed-quality";
import { makeBrief } from "./normalize";
import type { FeedItem } from "@/lib/types";
const base = { id: "video", source: "YouTube", title: "Still reporting after dying #ai #movie #shorts", summary: "Nguyen Movie AI", brief: { whatHappened: "YouTube published an update", whyItMatters: "", potentialImpact: "Review your roadmap", keyTakeaway: "" } } as FeedItem;
it("rejects hashtag-only entertainment including the reported card", () => {
  expect(isRelevantYouTube(base.title, base.summary)).toBe(false);
  expect(isRelevantYouTube("AI generated cat story #shorts", "Funny AI movie")).toBe(false);
  expect(isRelevantYouTube("Mango cutting #ai #Claude #tutorial", "AI channel")).toBe(false);
  expect(enforceFeedQuality([base])).toEqual([]);
});
it("retains technical demos, releases and tutorials even when short", () => {
  expect(isRelevantYouTube("Claude coding agent review", "A demo")).toBe(true);
  expect(isRelevantYouTube("How to create videos with Sora", "Tutorial")).toBe(true);
  expect(isRelevantYouTube("DeepSeek新模型发布与评测", "推理测试")).toBe(true);
});
it("checks original metadata so an AI rewrite cannot launder an unrelated video", () => {
  expect(enforceFeedQuality([{ ...base, title: "Claude model release", originalTitle: base.title, originalSummary: base.summary }])).toEqual([]);
});
it("removes ungrounded briefs from cached technical videos without dropping the video", () => {
  const result = enforceFeedQuality([{ ...base, title: "Claude coding agent review" }]);
  expect(result).toHaveLength(1);
  expect(result[0].briefReadiness).toBe("none");
  expect(result[0].brief.potentialImpact).toBe("");
});
it("removes legacy template analysis from cached non-video posts", () => {
  const post = { ...base, source: "OpenAI" as const, brief: { ...base.brief, potentialImpact: "Review whether this industry trends changes your roadmap, evaluation set, or product UX assumptions in the next sprint." } };
  const [result] = enforceFeedQuality([post]);
  expect(result.briefReadiness).toBe("factual-only");
  expect(result.brief.whatHappened).toBe(post.summary);
  expect(result.brief.potentialImpact).toBe("");
  expect(post.brief.potentialImpact).not.toBe("");
});
it("fallback briefs contain source text, not generic implications or platform attribution", () => {
  const brief = makeBrief({ title: "Model demo", summary: "A source description", source: "YouTube", category: "Industry Trends" });
  expect(brief).toEqual({ whatHappened: "A source description", whyItMatters: "", potentialImpact: "", keyTakeaway: "" });
});
