import type { FeedItem } from "@/lib/types";
import { slugId, toFeedItem } from "@/lib/live/normalize";

type XUser = {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
};

type XTweet = {
  id: string;
  text?: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
  };
};

type XSearchResponse = {
  data?: XTweet[];
  includes?: { users?: XUser[] };
  meta?: { result_count?: number; next_token?: string };
  errors?: { detail?: string; title?: string; status?: number }[];
  detail?: string;
  title?: string;
  status?: number;
};

export async function fetchX(limit = 10): Promise<FeedItem[]> {
  const raw = process.env.X_BEARER_TOKEN?.trim();
  if (!raw) {
    throw new Error("X_BEARER_TOKEN is missing in .env.local");
  }

  const query =
    '(AI OR LLM OR GPT OR Claude OR Gemini OR "machine learning" OR OpenAI OR Anthropic) -is:retweet lang:en';

  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(Math.max(limit, 10), 100)),
    "tweet.fields": "created_at,public_metrics,lang,author_id",
    expansions: "author_id",
    "user.fields": "name,username,profile_image_url",
    sort_order: "recency",
  });

  const tokenCandidates = Array.from(
    new Set([raw, raw.includes("%") ? decodeURIComponent(raw) : raw])
  );
  const hosts = ["api.x.com", "api.twitter.com"] as const;

  let data: XSearchResponse | null = null;
  let lastError = "Unknown X API error";
  let ok = false;
  let lastStatus = 0;

  outer: for (const token of tokenCandidates) {
    for (const host of hosts) {
      const res = await fetch(
        `https://${host}/2/tweets/search/recent?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );
      lastStatus = res.status;
      data = (await res.json()) as XSearchResponse;
      if (res.ok) {
        ok = true;
        break outer;
      }

      lastError =
        data.detail ||
        data.title ||
        data.errors?.[0]?.detail ||
        data.errors?.[0]?.title ||
        `HTTP ${res.status}`;
    }
  }

  if (!ok || !data) {
    const hint =
      lastStatus === 401
        ? "Bearer Token rejected. Regenerate App Bearer Token and confirm Pay Per Use credits are active for this app."
        : lastStatus === 402 || lastStatus === 403
          ? "Plan/credits may block recent search. Check Subscriptions for this app."
          : "See developer.x.com dashboard for app status.";
    throw new Error(`X API failed: ${lastError}. ${hint}`);
  }

  const users = new Map(
    (data.includes?.users ?? []).map((u) => [u.id, u] as const)
  );

  return (data.data ?? [])
    .filter((tweet) => tweet.id && tweet.text)
    .slice(0, limit)
    .map((tweet) => {
      const author = tweet.author_id ? users.get(tweet.author_id) : undefined;
      const handle = author?.username ? `@${author.username}` : "@x";
      const name = author?.name || handle;
      const metrics = tweet.public_metrics;
      const likes = metrics?.like_count ?? 0;
      const reposts = metrics?.retweet_count ?? 0;
      const replies = metrics?.reply_count ?? 0;
      const quotes = metrics?.quote_count ?? 0;
      const engagement = likes + reposts * 2 + replies + quotes;
      const text = tweet.text!.replace(/\s+/g, " ").trim();
      const title =
        text.length > 110 ? `${text.slice(0, 107).trim()}…` : text;
      const publishedAt = tweet.created_at
        ? new Date(tweet.created_at).toISOString()
        : new Date().toISOString();

      // Prefer higher-res avatar when API returns _normal
      const avatar = author?.profile_image_url?.replace("_normal", "_bigger");

      return toFeedItem({
        id: slugId("x", tweet.id),
        title,
        source: "X (Twitter)",
        publishedAt,
        category: "Industry Trends",
        summary: text.slice(0, 420),
        url: author?.username
          ? `https://x.com/${author.username}/status/${tweet.id}`
          : `https://x.com/i/web/status/${tweet.id}`,
        tags: ["live", "x", "twitter", handle.replace("@", "")],
        extraTrend: Math.min(40, Math.round(engagement / 5)),
        avatarUrl: avatar,
        native: {
          authorName: name,
          authorHandle: handle,
          likes,
          reposts,
          replies,
          quotes,
        },
      });
    });
}
