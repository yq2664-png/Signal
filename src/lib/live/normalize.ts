import type { Category, FeedItem, RankTier, Scores, Source } from "@/lib/types";

const AI_KEYWORDS = [
  "ai",
  "llm",
  "gpt",
  "claude",
  "gemini",
  "openai",
  "anthropic",
  "deepmind",
  "deepseek",
  "kimi",
  "moonshot",
  "bytedance",
  "doubao",
  "seed",
  "qwen",
  "flux",
  "embodied",
  "robotics",
  "humanoid",
  "agent",
  "model",
  "neural",
  "transformer",
  "diffusion",
  "machine learning",
  "deep learning",
  "generative",
  "chatbot",
  "copilot",
  "multimodal",
  "foundation model",
  "reasoning",
];

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugId(prefix: string, raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${prefix}-${base || Date.now().toString(36)}`;
}

export function looksAiRelated(text: string): boolean {
  const hay = text.toLowerCase();
  return AI_KEYWORDS.some((k) => hay.includes(k));
}

export function readingTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.min(12, Math.round(words / 180) || 2));
}

function hoursAgo(iso: string): number {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5);
}

export function scoreLiveItem(input: {
  title: string;
  summary: string;
  source: Source;
  publishedAt: string;
  extraTrend?: number;
}): { scores: Scores; tier: RankTier } {
  const text = `${input.title} ${input.summary}`.toLowerCase();
  const keywordHits = AI_KEYWORDS.filter((k) => text.includes(k)).length;
  const age = hoursAgo(input.publishedAt);

  const sourceWeight: Partial<Record<Source, number>> = {
    arXiv: 8,
    OpenAI: 14,
    Anthropic: 12,
    "Google DeepMind": 12,
    DeepSeek: 13,
    Kimi: 13,
    ByteDance: 12,
    "Black Forest Labs": 11,
    "Hugging Face": 10,
    "Tech Blog": 7,
    "Foreign Media": 9,
    "Embodied AI": 9,
    "Developer Community": 8,
    "GitHub · Articles": 9,
    "GitHub · Skills": 10,
    "GitHub · Projects": 9,
  };

  const freshness = age < 12 ? 18 : age < 48 ? 12 : age < 168 ? 6 : 2;
  const relevance = Math.min(
    98,
    55 + keywordHits * 6 + (sourceWeight[input.source] ?? 5)
  );
  const impact = Math.min(
    97,
    48 + (sourceWeight[input.source] ?? 5) + Math.min(20, keywordHits * 4) + freshness / 2
  );
  const trend = Math.min(
    98,
    40 + freshness * 2 + (input.extraTrend ?? 0) + Math.min(15, keywordHits * 3)
  );

  const scores = {
    impact: Math.round(impact),
    relevance: Math.round(relevance),
    trend: Math.round(trend),
  };

  return { scores, tier: tierFromScores(scores) };
}

export function tierFromScores(scores: Scores): RankTier {
  const composite = scores.impact * 0.45 + scores.relevance * 0.3 + scores.trend * 0.25;
  if (composite >= 78 || scores.impact >= 82) return "High Impact";
  if (composite >= 68 || scores.trend >= 75) return "Trending";
  return "Emerging";
}

export function makeBrief(input: {
  title: string;
  summary: string;
  source: Source;
  category: Category;
}): FeedItem["brief"] {
  const snippet =
    input.summary.slice(0, 220) + (input.summary.length > 220 ? "…" : "");

  return {
    whatHappened: `${input.source} published an update: ${input.title}. ${snippet}`,
    whyItMatters:
      "This item was ingested from a trusted source feed. A structured triage template is shown when the AI enrichment layer is unavailable.",
    potentialImpact: `Review whether this ${input.category.toLowerCase()} changes your roadmap, evaluation set, or product UX assumptions in the next sprint.`,
    keyTakeaway: `Skim the source, then decide: track, pilot, or ignore — starting from “${input.title.slice(0, 80)}${input.title.length > 80 ? "…" : ""}”.`,
  };
}

export function toFeedItem(input: {
  id: string;
  title: string;
  source: Source;
  publishedAt: string;
  category: Category;
  summary: string;
  url: string;
  tags?: string[];
  extraTrend?: number;
  imageUrl?: string;
  avatarUrl?: string;
  native?: FeedItem["native"];
  originalTitle?: string;
  originalSummary?: string;
}): FeedItem {
  const summary = stripHtml(input.summary) || input.title;
  const title = stripHtml(input.title);
  const originalTitle = stripHtml(input.originalTitle ?? input.title);
  const originalSummary = stripHtml(input.originalSummary ?? input.summary).slice(
    0,
    420
  );
  const { scores, tier } = scoreLiveItem({
    title,
    summary,
    source: input.source,
    publishedAt: input.publishedAt,
    extraTrend: input.extraTrend,
  });

  return {
    id: input.id,
    title,
    source: input.source,
    publishedAt: input.publishedAt,
    category: input.category,
    summary: summary.slice(0, 420),
    scores,
    tier,
    tags: input.tags ?? ["live"],
    url: input.url,
    brief: makeBrief({
      title,
      summary,
      source: input.source,
      category: input.category,
    }),
    readingTimeMin: readingTime(summary),
    imageUrl: input.imageUrl,
    avatarUrl: input.avatarUrl,
    originalTitle,
    originalSummary,
    native: input.native,
  };
}
