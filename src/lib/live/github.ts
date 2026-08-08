import type { FeedItem, Source } from "@/lib/types";
import { rewriteFeedTitle } from "@/lib/live/headlines";
import { slugId, toFeedItem } from "@/lib/live/normalize";

type GhRepo = {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  updated_at: string;
  topics?: string[];
  owner?: { login?: string; avatar_url?: string };
};

type GhSearchResponse = {
  items?: GhRepo[];
  message?: string;
};

/** Open-source projects quality bar */
const MIN_STARS_PROJECT = 1000;
const MIN_STARS_EMBODIED = 400;
/** Skills repos are newer/smaller — lower bar, still filtered */
const MIN_STARS_SKILL = 40;

function formatStars(n: number): string {
  if (n >= 1000) return `★ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `★ ${n}`;
}

function trendFromStars(stars: number): number {
  if (stars <= 0) return 0;
  return Math.min(45, Math.round(Math.log10(stars + 1) * 15));
}

function authHeaders(): Record<string, string> {
  const token =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_PAT?.trim();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SIGNAL-AI-Intelligence/0.1",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function searchRepos(
  query: string,
  perPage: number,
  sort: "stars" | "updated" = "stars"
): Promise<GhRepo[]> {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(Math.min(perPage, 15)));

  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(20000),
  });

  const data = (await res.json()) as GhSearchResponse;
  if (!res.ok) {
    throw new Error(
      `GitHub API failed: ${data.message || `HTTP ${res.status}`}`
    );
  }
  return data.items ?? [];
}

function qualityRank(repo: GhRepo): number {
  const stars = repo.stargazers_count ?? 0;
  const forks = repo.forks_count ?? 0;
  const ageHours = Math.max(
    1,
    (Date.now() - new Date(repo.pushed_at || repo.updated_at).getTime()) / 36e5
  );
  const freshness = Math.max(0, 40 - Math.log10(ageHours) * 12);
  return Math.log10(stars + 1) * 40 + Math.log10(forks + 1) * 8 + freshness;
}

function toRepoItem(
  repo: GhRepo,
  source: "GitHub · Projects" | "GitHub · Skills",
  kindTag: string
): FeedItem {
  const stars = repo.stargazers_count ?? 0;
  const forks = repo.forks_count ?? 0;
  const desc =
    repo.description?.trim() ||
    (source === "GitHub · Skills"
      ? `Agent skill repository · ${stars} stars.`
      : `High-signal AI repository · ${stars} stars · ${forks} forks.`);
  const topics = (repo.topics ?? []).slice(0, 3);
  const lang = repo.language?.trim();
  const title = rewriteFeedTitle({
    title: repo.full_name,
    summary: desc,
    source,
    repoName: repo.full_name,
  });

  return toFeedItem({
    id: slugId(source === "GitHub · Skills" ? "gh-skill" : "gh-proj", String(repo.id)),
    title,
    originalTitle: repo.full_name,
    originalSummary: desc,
    source,
    publishedAt: repo.pushed_at || repo.updated_at,
    category: source === "GitHub · Skills" ? "Tools" : "Tools",
    summary: desc,
    url: repo.html_url,
    tags: [
      "live",
      "github",
      kindTag,
      formatStars(stars),
      ...(lang ? [lang] : []),
      ...topics,
    ],
    extraTrend: trendFromStars(stars),
    avatarUrl: repo.owner?.avatar_url,
    native: {
      authorName: repo.owner?.login,
      authorHandle: repo.owner?.login,
      stars,
      forks,
      subtitle: source === "GitHub · Skills" ? "Skill" : lang,
      repoName: repo.full_name,
    },
  });
}

async function collectRepos(
  queries: { q: string; sort?: "stars" | "updated"; minStars: number }[],
  limit: number
): Promise<GhRepo[]> {
  const byId = new Map<number, GhRepo>();
  let lastError: unknown;

  for (const { q, sort = "stars", minStars } of queries) {
    try {
      const repos = await searchRepos(q, Math.max(limit, 10), sort);
      for (const repo of repos) {
        if ((repo.stargazers_count ?? 0) < minStars) continue;
        if (!byId.has(repo.id)) byId.set(repo.id, repo);
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (byId.size === 0 && lastError) {
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
  }

  return [...byId.values()]
    .sort((a, b) => qualityRank(b) - qualityRank(a))
    .slice(0, limit);
}

/** High-star AI/LLM open-source projects. */
export async function fetchGitHubProjects(limit = 10): Promise<FeedItem[]> {
  const repos = await collectRepos(
    [
      { q: `topic:llm stars:>${MIN_STARS_PROJECT}`, minStars: MIN_STARS_PROJECT },
      {
        q: `topic:ai-agents stars:>${MIN_STARS_PROJECT}`,
        minStars: MIN_STARS_PROJECT,
      },
      {
        q: `topic:generative-ai stars:>${MIN_STARS_PROJECT}`,
        minStars: MIN_STARS_PROJECT,
      },
      {
        q: `topic:embodied-ai stars:>${MIN_STARS_EMBODIED}`,
        minStars: MIN_STARS_EMBODIED,
      },
      {
        q: "deepseek OR moonshot OR kimi stars:>2000",
        minStars: MIN_STARS_PROJECT,
      },
    ],
    limit
  );

  if (repos.length === 0) {
    throw new Error("GitHub · Projects fetch returned no repos above star threshold");
  }

  return repos.map((r) => toRepoItem(r, "GitHub · Projects", "project"));
}

/** Agent Skills (SKILL.md / agent-skills ecosystem). */
export async function fetchGitHubSkills(limit = 8): Promise<FeedItem[]> {
  const repos = await collectRepos(
    [
      {
        q: `topic:agent-skills stars:>${MIN_STARS_SKILL}`,
        sort: "updated",
        minStars: MIN_STARS_SKILL,
      },
      {
        q: `topic:claude-skills stars:>${MIN_STARS_SKILL}`,
        sort: "updated",
        minStars: MIN_STARS_SKILL,
      },
      {
        q: `"SKILL.md" in:readme stars:>${MIN_STARS_SKILL}`,
        sort: "updated",
        minStars: MIN_STARS_SKILL,
      },
      {
        q: `cursor-skills OR "agent skill" stars:>${MIN_STARS_SKILL}`,
        sort: "updated",
        minStars: MIN_STARS_SKILL,
      },
    ],
    limit
  );

  if (repos.length === 0) {
    throw new Error("GitHub · Skills fetch returned no matching repos");
  }

  return repos.map((r) => toRepoItem(r, "GitHub · Skills", "skill"));
}

/** All GitHub segments used by the aggregator. */
export async function fetchGitHubAll(): Promise<FeedItem[]> {
  const results = await Promise.allSettled([
    fetchGitHubProjects(10),
    fetchGitHubSkills(8),
  ]);

  const items: FeedItem[] = [];
  const errors: string[] = [];

  results.forEach((result, i) => {
    const label = i === 0 ? "GitHub · Projects" : "GitHub · Skills";
    if (result.status === "fulfilled") items.push(...result.value);
    else {
      errors.push(`${label}: ${String(result.reason)}`);
      console.error(result.reason);
    }
  });

  if (items.length === 0) {
    throw new Error(
      `GitHub fetch failed: ${errors.join("; ") || "no items"}`
    );
  }

  return items;
}

/** @deprecated use fetchGitHubAll / fetchGitHubProjects */
export async function fetchGitHub(limit = 10): Promise<FeedItem[]> {
  return fetchGitHubProjects(limit);
}

export type GitHubSource = Extract<
  Source,
  "GitHub · Articles" | "GitHub · Skills" | "GitHub · Projects"
>;
