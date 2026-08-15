import type { ResearchPaper } from "@/lib/types";
import {
  calendarDay,
  normalizeAuthor,
  normalizeTitle,
  stripArxivVersion,
} from "@/lib/live/research-paper/identity";

export function paperIdentityKeys(paper: {
  arxivId?: string;
  doi?: string;
  title: string;
  authors: string[];
  publishedAt: string;
}): string[] {
  const keys: string[] = [];
  if (paper.arxivId) keys.push(`arxiv:${stripArxivVersion(paper.arxivId)}`);
  if (paper.doi) keys.push(`doi:${paper.doi.trim().toLowerCase()}`);
  const titleNorm = normalizeTitle(paper.title);
  const firstAuthor = normalizeAuthor(paper.authors[0] ?? "");
  const day = calendarDay(paper.publishedAt);
  if (titleNorm && firstAuthor && day) {
    keys.push(`title:${titleNorm}|${firstAuthor}|${day}`);
  }
  return keys;
}

export function deterministicDedupe<T extends {
  arxivId?: string;
  doi?: string;
  title: string;
  authors: string[];
  publishedAt: string;
}>(
  papers: T[]
): { unique: T[]; duplicates: Array<{ kept: T; dropped: T; key: string }> } {
  const seen = new Map<string, T>();
  const unique: T[] = [];
  const duplicates: Array<{ kept: T; dropped: T; key: string }> = [];

  for (const paper of papers) {
    const keys = paperIdentityKeys(paper);
    const hit = keys.find((key) => seen.has(key));
    if (hit) {
      duplicates.push({ kept: seen.get(hit) as T, dropped: paper, key: hit });
      continue;
    }
    unique.push(paper);
    for (const key of keys) {
      if (!seen.has(key)) seen.set(key, paper);
    }
  }

  return { unique, duplicates };
}

export function toTitleNorm(title: string): string {
  return normalizeTitle(title);
}
