import type { FeedItem } from "@/lib/types";

/** Preference weights learned from likes + saves */
export type UserPrefs = {
  sources: Record<string, number>;
  categories: Record<string, number>;
  tags: Record<string, number>;
  sampleSize: number;
};

export function personalizationBoost(
  item: FeedItem,
  prefs: UserPrefs | null | undefined
): number {
  if (!prefs || prefs.sampleSize < 1) return 0;

  let score = 0;
  score += (prefs.sources[item.source] ?? 0) * 6;
  score += (prefs.categories[item.category] ?? 0) * 4;

  for (const tag of item.tags ?? []) {
    score += (prefs.tags[tag.toLowerCase()] ?? 0) * 3;
  }

  // Soft cap so personalization can't fully override releases
  return Math.min(48, score);
}

export function prefsFromItems(
  liked: FeedItem[],
  saved: FeedItem[]
): UserPrefs {
  const weighted: { item: FeedItem; w: number }[] = [
    ...liked.map((item) => ({ item, w: 1 })),
    ...saved.map((item) => ({ item, w: 1.4 })),
  ];

  const sources: Record<string, number> = {};
  const categories: Record<string, number> = {};
  const tags: Record<string, number> = {};

  for (const { item, w } of weighted) {
    sources[item.source] = (sources[item.source] ?? 0) + w;
    categories[item.category] = (categories[item.category] ?? 0) + w;
    for (const tag of item.tags ?? []) {
      const t = tag.toLowerCase();
      if (t.startsWith("ai-")) continue;
      tags[t] = (tags[t] ?? 0) + w * 0.6;
    }
  }

  return { sources, categories, tags, sampleSize: weighted.length };
}
