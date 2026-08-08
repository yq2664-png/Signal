import type { FeedItem, RankTier, Scores } from "@/lib/types";
import { groupIdForSource } from "@/lib/source-groups";
import {
  personalizationBoost,
  type UserPrefs,
} from "@/lib/personalization";

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function compositeScore(scores: Scores): number {
  return Math.round(scores.impact * 0.45 + scores.relevance * 0.3 + scores.trend * 0.25);
}

export function sortFeed(
  items: FeedItem[],
  mode: "ranked" | "newest" | "impact" | "trend"
): FeedItem[] {
  const copy = [...items];
  switch (mode) {
    case "newest":
      return copy.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    case "impact":
      return copy.sort((a, b) => b.scores.impact - a.scores.impact);
    case "trend":
      return copy.sort((a, b) => b.scores.trend - a.scores.trend);
    case "ranked":
    default:
      return copy.sort((a, b) => compositeScore(b.scores) - compositeScore(a.scores));
  }
}

const RELEASE_CUE =
  /\b(introducing|announc(?:e|es|ed|ing)|launch(?:es|ed|ing)?|releas(?:e|es|ed|ing)|now available|generally available|\bga\b|open[- ]?sourc(?:e|ed)|model (?:card|family|weights|update)|api access|rolling out)\b/;
const MODEL_CUE =
  /\b(gpt[-\s]?\d|o\d|chatgpt|claude|sonnet|opus|haiku|gemini|llama|mistral|deepseek|kimi|moonshot|doubao|seed|qwen|grok|flux|foundation model|language model|\bllm\b|multimodal|reasoning model)\b/;

export function looksLikeModelRelease(title: string, summary = ""): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  const releaseCue = RELEASE_CUE.test(text);
  const modelCue = MODEL_CUE.test(text);
  return (
    (releaseCue && modelCue) ||
    (/^introducing\b/i.test(title.trim()) && (modelCue || releaseCue))
  );
}

/**
 * Higher = more like a frontier model / product launch.
 * Official lab posts about launches beat general lab blogs and third-party coverage.
 */
export function modelReleasePriority(item: FeedItem): number {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const isLab = groupIdForSource(item.source) === "labs";
  let p = 0;

  if (item.category === "Model Releases") p += 100;
  if (isLab) p += 50;

  const releaseCue = RELEASE_CUE.test(text);
  const modelCue = MODEL_CUE.test(text);

  if (releaseCue && modelCue) p += 90;
  else if (releaseCue && isLab) p += 55;
  else if (modelCue && isLab) p += 25;
  else if (releaseCue) p += 15;

  if (/^introducing\b/i.test(item.title.trim())) p += 35;
  if (
    /\b(gpt|claude|gemini|deepseek|kimi|doubao|o\d)\b/i.test(item.title) &&
    releaseCue
  )
    p += 25;

  return p;
}

/** Separate high-value items from noise for the board ranking. */
export function contentQualityScore(item: FeedItem): number {
  let q = compositeScore(item.scores);

  if (item.tier === "High Impact") q += 28;
  else if (item.tier === "Trending") q += 14;

  if (item.category === "Model Releases") q += 22;

  const stars = item.native?.stars ?? 0;
  if (stars > 0) q += Math.min(35, Math.log10(stars + 1) * 12);
  // Explicitly punish low-star GitHub noise if any slips through
  if (item.source === "GitHub · Projects" && stars > 0 && stars < 1000) q -= 40;
  if (item.source === "GitHub · Skills" && stars > 0 && stars < 40) q -= 20;

  const points = item.native?.points ?? 0;
  if (points > 0) q += Math.min(22, points / 8);

  const likes = item.native?.likes ?? 0;
  if (likes > 0) q += Math.min(16, Math.log10(likes + 1) * 6);

  const views = item.native?.views ?? 0;
  if (views > 0) q += Math.min(12, Math.log10(views + 1) * 3);

  // Title quality: prefer specific, scannable headlines
  if (item.title.length >= 40 && item.title.length <= 110) q += 6;
  if (item.title.length < 22) q -= 10;
  if (/^v?\d+\.\d+/.test(item.title.trim())) q -= 20;
  if (
    /[/]/.test(item.title) &&
    (item.source === "GitHub · Projects" || item.source === "GitHub · Skills")
  )
    q -= 12;

  const ageH =
    (Date.now() - new Date(item.publishedAt).getTime()) / 36e5;
  if (ageH < 48) q += 10;
  else if (ageH > 720) q -= 8;

  return q;
}

/** Model releases → personalization → quality → likes → recency. */
export function sortFeedBoard(
  items: FeedItem[],
  getLikes: (id: string) => number,
  prefs?: UserPrefs | null
): FeedItem[] {
  return [...items].sort((a, b) => {
    const releaseDiff = modelReleasePriority(b) - modelReleasePriority(a);
    if (releaseDiff !== 0) return releaseDiff;

    const personalDiff =
      personalizationBoost(b, prefs) - personalizationBoost(a, prefs);
    if (Math.abs(personalDiff) >= 3) return personalDiff;

    const qualityDiff = contentQualityScore(b) - contentQualityScore(a);
    if (Math.abs(qualityDiff) >= 2) return qualityDiff;

    const likeDiff = getLikes(b.id) - getLikes(a.id);
    if (likeDiff !== 0) return likeDiff;

    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  });
}

export function tierTone(tier: RankTier): string {
  switch (tier) {
    case "High Impact":
      return "tier-high";
    case "Trending":
      return "tier-trend";
    case "Emerging":
      return "tier-emerging";
  }
}

export function getItemById(items: FeedItem[], id: string): FeedItem | undefined {
  return items.find((item) => item.id === id);
}
