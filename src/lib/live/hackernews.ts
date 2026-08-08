import type { FeedItem } from "@/lib/types";
import { rewriteFeedTitle } from "@/lib/live/headlines";
import { looksAiRelated, slugId, toFeedItem } from "@/lib/live/normalize";

const MIN_POINTS = 15;

type HnItem = {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  time?: number;
  type?: string;
  descendants?: number;
  by?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`HN fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchHackerNews(limit = 10): Promise<FeedItem[]> {
  const ids = await fetchJson<number[]>(
    "https://hacker-news.firebaseio.com/v0/newstories.json"
  );

  const sampled = ids.slice(0, 60);
  const items = await Promise.all(
    sampled.map((id) =>
      fetchJson<HnItem | null>(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      ).catch(() => null)
    )
  );

  const aiStories = items
    .filter((item): item is HnItem => Boolean(item?.title && item.type === "story"))
    .filter((item) => looksAiRelated(`${item.title} ${item.text ?? ""}`))
    .filter((item) => (item.score ?? 0) >= MIN_POINTS)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  return aiStories.map((item) => {
    const publishedAt = new Date((item.time ?? 0) * 1000).toISOString();
    const discussUrl = `https://news.ycombinator.com/item?id=${item.id}`;
    const url = item.url ?? discussUrl;
    const points = item.score ?? 0;
    const comments = item.descendants ?? 0;
    const summary =
      item.text?.slice(0, 400) ||
      `HN discussion · ${points} points · ${comments} comments` +
        (item.by ? ` · by ${item.by}` : "");
    const rawTitle = item.title!;
    const title = rewriteFeedTitle({
      title: rawTitle,
      summary,
      source: "Developer Community",
    });

    return toFeedItem({
      id: slugId("hn", String(item.id)),
      title,
      originalTitle: rawTitle,
      originalSummary: summary,
      source: "Developer Community",
      publishedAt,
      category: "Industry Trends",
      summary,
      url,
      tags: ["live", "hackernews", `${points} pts`, `${comments} comments`],
      extraTrend: Math.min(35, Math.round(points / 4)),
      native: {
        authorName: item.by,
        authorHandle: item.by ? item.by : undefined,
        points,
        comments,
        subtitle: "Hacker News",
      },
    });
  });
}
