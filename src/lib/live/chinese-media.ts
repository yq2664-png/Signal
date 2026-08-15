import { rewriteFeedTitle } from "@/lib/live/headlines";
import { slugId, stripHtml, toFeedItem } from "@/lib/live/normalize";
import { enrichOgImages } from "@/lib/live/og-image";
import type { FeedItem } from "@/lib/types";
import { looksLikeModelRelease } from "@/lib/utils";

type WpRendered = { rendered?: string };
type WpPost = {
  id: number;
  date_gmt?: string;
  date?: string;
  link?: string;
  title?: WpRendered;
  excerpt?: WpRendered;
  content?: WpRendered;
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url?: string;
      media_details?: {
        sizes?: Record<string, { source_url?: string }>;
      };
    }>;
    author?: Array<{ name?: string }>;
  };
};

const AIERA_POSTS_URL =
  "https://aiera.com.cn/wp-json/wp/v2/posts?per_page=8&_embed=1";

function featuredImage(post: WpPost): string | undefined {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  if (!media) return undefined;
  return (
    media.source_url ||
    media.media_details?.sizes?.medium_large?.source_url ||
    media.media_details?.sizes?.medium?.source_url ||
    media.media_details?.sizes?.large?.source_url
  );
}

/** 新智元 — WordPress REST (no public RSS) */
export async function fetchXinZhiYuan(limit = 6): Promise<FeedItem[]> {
  try {
    const res = await fetch(AIERA_POSTS_URL, {
      headers: {
        "User-Agent": "SIGNAL-AI-Intelligence/0.1 (+local-dev)",
        Accept: "application/json",
      },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const posts = (await res.json()) as WpPost[];

    let items = posts.slice(0, limit).flatMap((post) => {
      const rawTitle = stripHtml(post.title?.rendered ?? "");
      const link = post.link?.trim();
      if (!rawTitle || !link) return [];

      const summary =
        stripHtml(post.excerpt?.rendered ?? "") ||
        stripHtml(post.content?.rendered ?? "").slice(0, 280) ||
        rawTitle;
      const publishedAt = post.date_gmt
        ? new Date(`${post.date_gmt}Z`).toISOString()
        : post.date
          ? new Date(post.date).toISOString()
          : new Date().toISOString();
      const category = looksLikeModelRelease(rawTitle, summary)
        ? ("Model Releases" as const)
        : ("Industry Trends" as const);
      const title = rewriteFeedTitle({
        title: rawTitle,
        summary,
        source: "新智元",
      });
      const author = post._embedded?.author?.[0]?.name;

      return [
        toFeedItem({
          id: slugId("xinzhiyuan", String(post.id) || link),
          title,
          originalTitle: rawTitle,
          originalSummary: summary,
          source: "新智元",
          publishedAt,
          category,
          summary,
          url: link,
          tags: [
            "live",
            "aiera",
            "xinzhiyuan",
            ...(category === "Model Releases" ? ["model-release"] : []),
          ],
          imageUrl: featuredImage(post),
          native: {
            authorName: author,
            subtitle: "新智元",
          },
        }),
      ];
    });

    items = await enrichOgImages(items, limit);
    return items;
  } catch (error) {
    console.error("[xinzhiyuan] failed", error);
    return [];
  }
}
