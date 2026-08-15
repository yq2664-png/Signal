import { hasConcreteArtifact, hasProductImplication } from "@/lib/live/developer-community/artifact";
import {
  DEVELOPER_COMMUNITY_USER_AGENT,
  HN_EVIDENCE_WINDOW_DAYS,
} from "@/lib/live/developer-community/config";
import { evidenceExclusion } from "@/lib/live/developer-community/exclude";
import { resolveProduct } from "@/lib/live/developer-community/products";
import { candidateTypeFor, normalizeTopic } from "@/lib/live/developer-community/topics";
import { looksAiRelated, slugId } from "@/lib/live/normalize";
import type { DeveloperCommunityEvidence } from "@/lib/types";

type AlgoliaHit = {
  objectID?: string;
  title?: string;
  url?: string;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
  story_text?: string;
  stars?: number;
};

export type HnCaptureResult = {
  captured: DeveloperCommunityEvidence[];
  rejected: Array<{ title: string; reason: string; url?: string }>;
  errors: string[];
};

export function hnHitToEvidence(hit: AlgoliaHit):
  | { evidence: DeveloperCommunityEvidence }
  | { rejected: { title: string; reason: string; url?: string } } {
  const title = hit.title || "";
  const body = hit.story_text || "";
  const url = hit.objectID
    ? `https://news.ycombinator.com/item?id=${hit.objectID}`
    : hit.url || "";
  if (
    !looksAiRelated(`${title} ${body}`) &&
    !/\b(mcp|claude code|cline|opencode|ai sdk|tool call)\b/i.test(
      `${title} ${body}`
    )
  ) {
    return { rejected: { title, reason: "no-product-implication", url } };
  }
  const excluded = evidenceExclusion(title, body, {
    sourceFamily: "hn",
    points: hit.points,
    comments: hit.num_comments,
    stars: hit.stars,
  });
  if (excluded) {
    return { rejected: { title, reason: excluded, url } };
  }
  const topic = normalizeTopic(title, body);
  const createdAt = hit.created_at || new Date().toISOString();
  return {
    evidence: {
      evidenceId: slugId("hn", hit.objectID || title),
      sourceFamily: "hn",
      sourceType: "hn-story",
      sourceUrl: url,
      product: resolveProduct({ title, body }),
      normalizedTopic: topic,
      candidateSignalType: candidateTypeFor(topic, title, body),
      authorId: hit.author || "unknown",
      createdAt,
      updatedAt: createdAt,
      title,
      bodySummary: body.replace(/\s+/g, " ").trim().slice(0, 420),
      concreteArtifact: hasConcreteArtifact(title, body),
      productImplication: hasProductImplication(title, body, topic),
      engagement: { points: hit.points, comments: hit.num_comments, stars: hit.stars },
    },
  };
}

export async function fetchHnEvidence(now = new Date()): Promise<HnCaptureResult> {
  const since = Math.floor(
    (now.getTime() - HN_EVIDENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000
  );
  const queries = [
    "MCP",
    '"Claude Code"',
    "Cline",
    "OpenCode",
    '"AI SDK"',
    '"tool call"',
  ];
  try {
    const pages = await Promise.all(
      queries.map(async (query) => {
        const url =
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}` +
          `&tags=story&hitsPerPage=20&numericFilters=created_at_i>${since}`;
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": DEVELOPER_COMMUNITY_USER_AGENT,
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          throw new Error(`hn ${query}: HTTP ${response.status}`);
        }
        const payload = (await response.json()) as { hits?: AlgoliaHit[] };
        return payload.hits ?? [];
      })
    );
    const seen = new Set<string>();
    const captured: DeveloperCommunityEvidence[] = [];
    const rejected: HnCaptureResult["rejected"] = [];
    for (const hit of pages.flat()) {
      const id = hit.objectID || hit.title || "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const result = hnHitToEvidence(hit);
      if ("rejected" in result) rejected.push(result.rejected);
      else captured.push(result.evidence);
    }
    return { captured, rejected, errors: [] };
  } catch (error) {
    return {
      captured: [],
      rejected: [],
      errors: [`hn: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
