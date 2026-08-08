import type { FeedItem } from "@/lib/types";
import { slugId, toFeedItem } from "@/lib/live/normalize";

type YtThumbnail = { url?: string; width?: number; height?: number };

type YtSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelTitle?: string;
    thumbnails?: {
      default?: YtThumbnail;
      medium?: YtThumbnail;
      high?: YtThumbnail;
    };
  };
};

type YtSearchResponse = {
  items?: YtSearchItem[];
  error?: { message?: string; errors?: { reason?: string }[] };
};

type YtVideoDetails = {
  id?: string;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string };
};

type YtVideosResponse = {
  items?: YtVideoDetails[];
};

function pickThumbnail(
  videoId: string,
  thumbnails?: YtSearchItem["snippet"] extends infer S
    ? S extends { thumbnails?: infer T }
      ? T
      : undefined
    : undefined
): string {
  const fromApi =
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url;
  return fromApi || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Parse ISO-8601 duration like PT1H2M3S → "1:02:03" / "12:34" */
function formatDuration(iso?: string): string | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const sec = Number(m[3] ?? 0);
  if (h > 0) {
    return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${min}:${String(sec).padStart(2, "0")}`;
}

async function fetchVideoDetails(
  key: string,
  ids: string[]
): Promise<Map<string, YtVideoDetails>> {
  const map = new Map<string, YtVideoDetails>();
  if (ids.length === 0) return map;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails,statistics");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
  if (!res.ok) return map;
  const data = (await res.json()) as YtVideosResponse;
  for (const item of data.items ?? []) {
    if (item.id) map.set(item.id, item);
  }
  return map;
}

export async function fetchYouTube(limit = 8): Promise<FeedItem[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    throw new Error("YOUTUBE_API_KEY is missing in .env.local");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set(
    "q",
    "AI OR LLM OR GPT OR Claude OR Gemini OR \"machine learning\""
  );
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", String(Math.min(limit, 15)));
  url.searchParams.set("relevanceLanguage", "en");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), {
    next: { revalidate: 1800 },
  });

  const data = (await res.json()) as YtSearchResponse;

  if (!res.ok) {
    const reason =
      data.error?.message ||
      data.error?.errors?.[0]?.reason ||
      `HTTP ${res.status}`;
    throw new Error(`YouTube API failed: ${reason}`);
  }

  const searchItems = (data.items ?? []).filter(
    (item) => item.id?.videoId && item.snippet?.title
  );
  const videoIds = searchItems.map((i) => i.id!.videoId!);
  const details = await fetchVideoDetails(key, videoIds);

  return searchItems.map((item) => {
    const videoId = item.id!.videoId!;
    const title = item.snippet!.title!;
    const description = item.snippet?.description || title;
    const publishedAt = item.snippet?.publishedAt
      ? new Date(item.snippet.publishedAt).toISOString()
      : new Date().toISOString();
    const channel = item.snippet?.channelTitle || "YouTube";
    const detail = details.get(videoId);
    const views = detail?.statistics?.viewCount
      ? Number(detail.statistics.viewCount)
      : undefined;
    const durationLabel = formatDuration(detail?.contentDetails?.duration);
    const viewBoost = views
      ? Math.min(20, Math.round(Math.log10(views + 1) * 4))
      : 8;

    return toFeedItem({
      id: slugId("yt", videoId),
      title,
      source: "YouTube",
      publishedAt,
      category: "Industry Trends",
      summary: `${channel}: ${description}`.slice(0, 420),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      tags: ["live", "youtube", channel.toLowerCase().replace(/\s+/g, "-")],
      extraTrend: viewBoost,
      imageUrl: pickThumbnail(videoId, item.snippet?.thumbnails),
      native: {
        authorName: channel,
        subtitle: channel,
        views,
        durationLabel,
      },
    });
  });
}
