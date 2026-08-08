import Parser from "rss-parser";
import type { Category, FeedItem, Source } from "@/lib/types";
import { rewriteFeedTitle } from "@/lib/live/headlines";
import { looksAiRelated, slugId, stripHtml, toFeedItem } from "@/lib/live/normalize";
import { enrichOgImages } from "@/lib/live/og-image";
import { looksLikeModelRelease } from "@/lib/utils";

type RssItem = {
  title?: string;
  link?: string;
  guid?: string;
  contentSnippet?: string;
  content?: string;
  isoDate?: string;
  pubDate?: string;
  creator?: string;
  "dc:creator"?: string;
  categories?: string[];
  enclosure?: { url?: string; type?: string; length?: string };
  "media:content"?: unknown;
  "media:thumbnail"?: unknown;
};

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "SIGNAL-AI-Intelligence/0.1 (+local-dev)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  },
  customFields: {
    item: [
      ["media:content", "media:content", { keepArray: true }],
      ["media:thumbnail", "media:thumbnail", { keepArray: true }],
      ["dc:creator", "dc:creator"],
    ],
  },
});

export type RssSourceConfig = {
  source: Source;
  category: Category;
  url: string;
  limit?: number;
  /** If true, drop items that don't look AI-related */
  requireAi?: boolean;
  tags?: string[];
  /** Fetch page OG images when RSS has no enclosure */
  fetchOg?: boolean;
};

export const RSS_SOURCES: RssSourceConfig[] = [
  {
    source: "OpenAI",
    category: "AI Products",
    url: "https://openai.com/news/rss.xml",
    limit: 6,
    tags: ["live", "openai", "rss"],
    fetchOg: true,
  },
  {
    source: "Anthropic",
    category: "AI Products",
    url: "https://raw.githubusercontent.com/taobojlen/anthropic-rss-feed/main/anthropic_news_rss.xml",
    limit: 6,
    tags: ["live", "anthropic", "rss"],
    fetchOg: true,
  },
  {
    source: "Google DeepMind",
    category: "Research Papers",
    url: "https://deepmind.google/blog/rss.xml",
    limit: 6,
    tags: ["live", "deepmind", "rss"],
    fetchOg: true,
  },
  {
    source: "DeepSeek",
    category: "Model Releases",
    url: "https://github.com/deepseek-ai/DeepSeek-V3/releases.atom",
    limit: 4,
    tags: ["live", "deepseek", "release"],
  },
  {
    source: "DeepSeek",
    category: "Model Releases",
    url: "https://github.com/deepseek-ai/DeepSeek-R1/releases.atom",
    limit: 3,
    tags: ["live", "deepseek", "release"],
  },
  {
    source: "Kimi",
    category: "Model Releases",
    url: "https://github.com/MoonshotAI/Kimi-K2/releases.atom",
    limit: 4,
    tags: ["live", "kimi", "moonshot", "release"],
  },
  {
    source: "ByteDance",
    category: "Model Releases",
    url: "https://github.com/ByteDance-Seed/Seed-Thinking-v1.5/releases.atom",
    limit: 4,
    tags: ["live", "bytedance", "seed", "release"],
  },
  {
    source: "Black Forest Labs",
    category: "Model Releases",
    url: "https://github.com/black-forest-labs/flux/releases.atom",
    limit: 4,
    tags: ["live", "bfl", "flux", "release"],
  },
  {
    source: "Hugging Face",
    category: "Tools",
    url: "https://huggingface.co/blog/feed.xml",
    limit: 6,
    tags: ["live", "huggingface", "rss"],
    fetchOg: true,
  },
  {
    source: "GitHub · Articles",
    category: "Industry Trends",
    url: "https://github.blog/ai-and-ml/feed/",
    limit: 6,
    tags: ["live", "github", "article", "rss"],
    fetchOg: true,
  },
  {
    source: "GitHub · Articles",
    category: "Industry Trends",
    url: "https://github.blog/changelog/feed/",
    limit: 4,
    requireAi: true,
    tags: ["live", "github", "changelog", "article", "rss"],
    fetchOg: true,
  },
  {
    source: "Tech Blog",
    category: "Industry Trends",
    url: "https://simonwillison.net/atom/everything/",
    limit: 6,
    requireAi: true,
    tags: ["live", "blog", "rss"],
    fetchOg: true,
  },
  {
    source: "Foreign Media",
    category: "Industry Trends",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    limit: 6,
    tags: ["live", "techcrunch", "rss"],
    fetchOg: true,
  },
  {
    source: "Foreign Media",
    category: "Industry Trends",
    url: "https://www.technologyreview.com/feed/",
    limit: 5,
    requireAi: true,
    tags: ["live", "mit-tr", "rss"],
    fetchOg: true,
  },
  {
    source: "Foreign Media",
    category: "Industry Trends",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    limit: 6,
    tags: ["live", "verge", "rss"],
    fetchOg: true,
  },
  {
    source: "Embodied AI",
    category: "Industry Trends",
    url: "https://www.therobotreport.com/feed/",
    limit: 6,
    tags: ["live", "robotics", "embodied", "rss"],
    fetchOg: true,
  },
  {
    source: "Embodied AI",
    category: "Industry Trends",
    url: "https://spectrum.ieee.org/feeds/topic/robotics.rss",
    limit: 5,
    tags: ["live", "ieee", "robotics", "embodied", "rss"],
    fetchOg: true,
  },
];

function cleanImageUrl(raw: string): string {
  return raw
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function firstImgSrc(html?: string): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ? cleanImageUrl(match[1]) : undefined;
}

function mediaUrlFromUnknown(node: unknown): string | undefined {
  if (!node) return undefined;
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node)) return cleanImageUrl(node);
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const url = mediaUrlFromUnknown(entry);
      if (url) return url;
    }
    return undefined;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.url === "string") return cleanImageUrl(obj.url);
    if (obj.$ && typeof obj.$ === "object") {
      const attrs = obj.$ as Record<string, unknown>;
      if (typeof attrs.url === "string") return cleanImageUrl(attrs.url);
    }
    if (typeof obj["@_url"] === "string") return cleanImageUrl(obj["@_url"]);
  }
  return undefined;
}

/** Pull media:content / media:thumbnail urls from raw RSS XML by item link */
function extractMediaByLink(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const link =
      block.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1]?.trim() ||
      block.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1]?.trim();
    if (!link) continue;
    const media =
      block.match(
        /<media:(?:content|thumbnail)[^>]*\surl=["']([^"']+)["'][^>]*>/i
      )?.[1] ||
      block.match(
        /<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i
      )?.[1];
    if (media) map.set(link, cleanImageUrl(media));
  }
  return map;
}

function pickImage(
  item: RssItem,
  mediaByLink?: Map<string, string>
): string | undefined {
  const enclosure = item.enclosure;
  if (enclosure?.url) {
    const type = enclosure.type ?? "";
    if (
      type.startsWith("image/") ||
      /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(enclosure.url)
    ) {
      return cleanImageUrl(enclosure.url);
    }
  }

  const fromMedia =
    mediaUrlFromUnknown(item["media:content"]) ||
    mediaUrlFromUnknown(item["media:thumbnail"]);
  if (fromMedia) return fromMedia;

  const link = item.link || (item.guid ? String(item.guid) : undefined);
  if (link && mediaByLink?.get(link)) return mediaByLink.get(link);

  return firstImgSrc(item.content);
}

export async function fetchRssFeed(config: RssSourceConfig): Promise<FeedItem[]> {
  try {
    const res = await fetch(config.url, {
      headers: {
        "User-Agent": "SIGNAL-AI-Intelligence/0.1 (+local-dev)",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const mediaByLink = extractMediaByLink(xml);
    const feed = await parser.parseString(xml);
    const limit = config.limit ?? 6;

    let items = (feed.items as RssItem[] | undefined ?? [])
      .filter((item) => item.title && (item.link || item.guid))
      .filter((item) => {
        if (!config.requireAi) return true;
        return looksAiRelated(
          `${item.title} ${item.contentSnippet ?? item.content ?? ""}`
        );
      })
      .slice(0, limit)
      .map((item) => {
        const link = item.link || String(item.guid);
        const summary =
          item.contentSnippet ||
          stripHtml(item.content ?? "") ||
          feed.description ||
          item.title!;
        const publishedAt = item.isoDate
          ? new Date(item.isoDate).toISOString()
          : item.pubDate
            ? new Date(item.pubDate).toISOString()
            : new Date().toISOString();

        const creator = item.creator || item["dc:creator"] || undefined;
        const categories = (item.categories ?? [])
          .map((c) => String(c).trim())
          .filter(Boolean)
          .slice(0, 4);
        const imageUrl = pickImage(item, mediaByLink);

        const category: Category = looksLikeModelRelease(item.title!, summary)
          ? "Model Releases"
          : config.category;
        const rawTitle = item.title!;
        const title = rewriteFeedTitle({
          title: rawTitle,
          summary,
          source: config.source,
        });

        return toFeedItem({
          id: slugId(
            config.source.toLowerCase().replace(/\s+/g, "-"),
            link || rawTitle
          ),
          title,
          originalTitle: rawTitle,
          originalSummary: summary,
          source: config.source,
          publishedAt,
          category,
          summary,
          url: link!,
          tags: [
            ...(config.tags ?? ["live", "rss"]),
            ...categories,
            ...(category === "Model Releases" ? ["model-release"] : []),
          ],
          imageUrl,
          native: {
            authorName: creator,
            subtitle: categories[0] || config.source,
          },
        });
      });

    if (config.fetchOg) {
      items = await enrichOgImages(items, limit);
    }

    return items;
  } catch (error) {
    console.error(`[rss] failed ${config.url}`, error);
    return [];
  }
}

export async function fetchAllRss(): Promise<FeedItem[]> {
  const batches = await Promise.all(RSS_SOURCES.map((cfg) => fetchRssFeed(cfg)));
  return batches.flat();
}
