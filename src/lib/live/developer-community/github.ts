import { hasConcreteArtifact, hasProductImplication } from "@/lib/live/developer-community/artifact";
import {
  ALLOWLISTED_REPOS,
  DEVELOPER_COMMUNITY_USER_AGENT,
  EVIDENCE_CAP_PER_REPO,
  isAllowlistedRepo,
  isWithinIssueWindow,
  issueWindowStart,
  type AllowlistedRepo,
} from "@/lib/live/developer-community/config";
import {
  evidenceExclusion,
  isBotAuthor,
  isFeatureRequest,
  isPullRequest,
  normalizeTitle,
} from "@/lib/live/developer-community/exclude";
import { resolveProduct } from "@/lib/live/developer-community/products";
import { candidateTypeFor, normalizeTopic } from "@/lib/live/developer-community/topics";
import type { DeveloperCommunityEvidence } from "@/lib/types";
import { slugId } from "@/lib/live/normalize";

type GhIssue = {
  id: number;
  number: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  comments?: number;
  pull_request?: unknown;
  user?: { login?: string; type?: string };
};

function authHeaders(): Record<string, string> {
  const token =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_PAT?.trim();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": DEVELOPER_COMMUNITY_USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export type IssueCaptureResult = {
  captured: DeveloperCommunityEvidence[];
  rejected: Array<{
    repository: string;
    title: string;
    reason: string;
    url?: string;
  }>;
  errors: string[];
};

export function issueToEvidence(
  repository: AllowlistedRepo,
  issue: GhIssue
):
  | { evidence: DeveloperCommunityEvidence }
  | { rejected: { repository: string; title: string; reason: string; url?: string } } {
  const title = issue.title || "";
  const body = issue.body || "";
  if (isPullRequest(issue)) {
    return {
      rejected: {
        repository,
        title,
        reason: "pull-request",
        url: issue.html_url,
      },
    };
  }
  if (isBotAuthor(issue.user?.login, issue.user?.type)) {
    return {
      rejected: {
        repository,
        title,
        reason: "bot-author",
        url: issue.html_url,
      },
    };
  }
  if (isFeatureRequest(title, body)) {
    return {
      rejected: {
        repository,
        title,
        reason: "feature-request",
        url: issue.html_url,
      },
    };
  }
  const excluded = evidenceExclusion(title, body, {
    sourceFamily: "github-issues",
    comments: issue.comments,
  });
  if (excluded) {
    return {
      rejected: {
        repository,
        title,
        reason: excluded,
        url: issue.html_url,
      },
    };
  }
  const topic = normalizeTopic(title, body);
  const product = resolveProduct({ repository, title, body });
  const createdAt = issue.created_at || new Date().toISOString();
  return {
    evidence: {
      evidenceId: slugId("ghi", `${repository}-${issue.number}`),
      sourceFamily: "github-issues",
      sourceType: "github-issue",
      sourceUrl: issue.html_url || `https://github.com/${repository}/issues/${issue.number}`,
      repository,
      product,
      normalizedTopic: topic,
      candidateSignalType: candidateTypeFor(topic, title, body),
      authorId: issue.user?.login || "unknown",
      createdAt,
      updatedAt: issue.updated_at || createdAt,
      title,
      bodySummary: body.replace(/\s+/g, " ").trim().slice(0, 420),
      concreteArtifact: hasConcreteArtifact(title, body),
      productImplication: hasProductImplication(title, body, topic),
      engagement: { comments: issue.comments },
      metadata: { number: issue.number, titleNorm: normalizeTitle(title) },
    },
  };
}

export function collectRepoEvidence(
  repository: string,
  issues: GhIssue[],
  now = new Date()
): {
  captured: DeveloperCommunityEvidence[];
  rejected: IssueCaptureResult["rejected"];
} {
  if (!isAllowlistedRepo(repository)) {
    return {
      captured: [],
      rejected: issues.map((issue) => ({
        repository,
        title: issue.title || "",
        reason: "not-allowlisted",
        url: issue.html_url,
      })),
    };
  }
  const captured: DeveloperCommunityEvidence[] = [];
  const rejected: IssueCaptureResult["rejected"] = [];
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();
  for (const issue of issues) {
    if (captured.length >= EVIDENCE_CAP_PER_REPO) break;
    if (!isWithinIssueWindow(repository, issue.created_at, now)) {
      continue;
    }
    const result = issueToEvidence(repository, issue);
    if ("rejected" in result) {
      rejected.push(result.rejected);
      continue;
    }
    const titleNorm = String(result.evidence.metadata?.titleNorm || "");
    if (
      (titleNorm && seenTitles.has(titleNorm)) ||
      seenUrls.has(result.evidence.sourceUrl)
    ) {
      rejected.push({
        repository,
        title: result.evidence.title,
        reason: "duplicate",
        url: result.evidence.sourceUrl,
      });
      continue;
    }
    if (titleNorm) seenTitles.add(titleNorm);
    seenUrls.add(result.evidence.sourceUrl);
    captured.push(result.evidence);
  }
  return { captured, rejected };
}

async function fetchRepoIssues(
  repository: AllowlistedRepo,
  now: Date
): Promise<{
  captured: DeveloperCommunityEvidence[];
  rejected: IssueCaptureResult["rejected"];
  error?: string;
}> {
  const since = issueWindowStart(repository, now);
  const url = new URL(`https://api.github.com/repos/${repository}/issues`);
  url.searchParams.set("state", "all");
  url.searchParams.set("since", since.toISOString());
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");
  try {
    const response = await fetch(url, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return {
        captured: [],
        rejected: [],
        error: `${repository}: HTTP ${response.status}`,
      };
    }
    const payload = (await response.json()) as GhIssue[];
    return collectRepoEvidence(repository, payload, now);
  } catch (error) {
    return {
      captured: [],
      rejected: [],
      error: `${repository}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function fetchAllowlistedIssues(now = new Date()): Promise<IssueCaptureResult> {
  const captured: DeveloperCommunityEvidence[] = [];
  const rejected: IssueCaptureResult["rejected"] = [];
  const errors: string[] = [];
  for (const repository of ALLOWLISTED_REPOS) {
    const result = await fetchRepoIssues(repository, now);
    captured.push(...result.captured);
    rejected.push(...result.rejected);
    if (result.error) errors.push(result.error);
  }
  return { captured, rejected, errors };
}
