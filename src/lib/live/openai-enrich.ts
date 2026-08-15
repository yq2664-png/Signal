import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { FeedItem, Scores } from "@/lib/types";
import { autoFlagIfNeeded } from "@/lib/live/bad-cases";
import { getCacheDir } from "@/lib/live/cache-dir";
import { pruneByAgeAndCap } from "@/lib/live/cache-prune";
import { tierFromScores } from "@/lib/live/normalize";

/** Drop enrichments older than 14d; keep at most 400 newest */
const ENRICH_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const ENRICH_MAX_ENTRIES = 400;

type Enrichment = {
  scores: Scores;
  brief: FeedItem["brief"];
  /** Who-did-what headline */
  headline?: string;
  /** Skimmable 1–2 sentence summary */
  blurb?: string;
  tags?: string[];
  model: string;
  enrichedAt: string;
};

type CacheFile = Record<string, Enrichment>;

/** v3: includes AI headline + blurb */
const CACHE_FILE = path.join(getCacheDir(), "openai-enrichments-v3.json");
const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const MAX_ENRICH_PER_RUN = Number(process.env.OPENAI_ENRICH_LIMIT || 20);
const CONCURRENCY = 4;

function cacheKey(item: FeedItem): string {
  return createHash("sha256")
    .update(
      `${item.id}|${item.originalTitle ?? item.title}|${(item.originalSummary ?? item.summary).slice(0, 280)}|v3`
    )
    .digest("hex")
    .slice(0, 24);
}

async function loadCache(): Promise<CacheFile> {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return {};
  }
}

async function saveCache(cache: CacheFile): Promise<void> {
  const pruned = pruneByAgeAndCap(cache, {
    getTimestamp: (v) => v.enrichedAt,
    maxAgeMs: ENRICH_MAX_AGE_MS,
    maxEntries: ENRICH_MAX_ENTRIES,
  });
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(pruned), "utf8");
}

function clampScore(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function cleanHeadline(raw: unknown, fallback: string): string {
  const s = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!s) return fallback;
  return s.slice(0, 110);
}

function cleanBlurb(raw: unknown, fallback: string): string {
  const s = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return fallback;
  return s.slice(0, 280);
}

async function enrichOne(item: FeedItem): Promise<Enrichment | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const system = `You are SIGNAL, an AI intelligence desk for product managers and UX designers.
Rewrite the update for a fast-scanning feed, score it, and write an Impact Brief in English.
Return ONLY valid JSON with this shape:
{
  "headline": "Who did what — one line",
  "blurb": "1-2 sentence core summary for skimming",
  "impact": 0-100,
  "relevance": 0-100,
  "trend": 0-100,
  "whatHappened": "2-3 sentences",
  "whyItMatters": "2-3 sentences on industry/product significance",
  "potentialImpact": "2-3 sentences for products, design, or business",
  "keyTakeaway": "one actionable sentence",
  "tags": ["short", "tags"]
}

Headline rules (critical):
- Pattern: "{Actor} {verb} {object/outcome}" e.g. "OpenAI launches Health in ChatGPT" or "DeepSeek releases a cheaper reasoning model".
- Actor = company, lab, repo, or person when known; otherwise a concrete subject.
- Prefer concrete product/model names over vague words like "update" or "announcement".
- Max ~90 characters. No clickbait. No owner/repo paths. No bare version tags like v1.2.0.
- English only.

Blurb rules:
- 1–2 sentences, max ~220 chars, say what changed and why a PM might care.
- Do not repeat the headline verbatim.

Scoring guide:
- impact: lasting importance for AI product ecosystem
- relevance: usefulness to PMs/designers shipping AI features
- trend: momentum / how hot this is right now`;

  const user = `Source: ${item.source}
Category: ${item.category}
Published: ${item.publishedAt}
Raw title: ${item.originalTitle ?? item.title}
Raw summary: ${item.originalSummary ?? item.summary}
URL: ${item.url}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  const parsed = JSON.parse(content) as Record<string, unknown>;
  const scores: Scores = {
    impact: clampScore(parsed.impact, item.scores.impact),
    relevance: clampScore(parsed.relevance, item.scores.relevance),
    trend: clampScore(parsed.trend, item.scores.trend),
  };

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map(String).slice(0, 6)
    : undefined;

  return {
    scores,
    headline: cleanHeadline(parsed.headline, item.title),
    blurb: cleanBlurb(parsed.blurb, item.summary),
    brief: {
      whatHappened: String(parsed.whatHappened || item.brief.whatHappened),
      whyItMatters: String(parsed.whyItMatters || item.brief.whyItMatters),
      potentialImpact: String(parsed.potentialImpact || item.brief.potentialImpact),
      keyTakeaway: String(parsed.keyTakeaway || item.brief.keyTakeaway),
    },
    tags,
    model: MODEL,
    enrichedAt: new Date().toISOString(),
  };
}

function applyEnrichment(item: FeedItem, enrichment: Enrichment): FeedItem {
  const tags = new Set([...(item.tags || []), "ai-brief", "ai-headline"]);
  if (enrichment.tags) enrichment.tags.forEach((t) => tags.add(t));

  return {
    ...item,
    originalTitle: item.originalTitle ?? item.title,
    originalSummary: item.originalSummary ?? item.summary,
    title: enrichment.headline?.trim() || item.title,
    summary: enrichment.blurb?.trim() || item.summary,
    scores: enrichment.scores,
    tier: tierFromScores(enrichment.scores),
    brief: enrichment.brief,
    tags: [...tags],
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function run() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
  return results;
}

export type EnrichResult = {
  items: FeedItem[];
  enrichedCount: number;
  cacheHits: number;
  skipped: boolean;
  error?: string;
};

export async function enrichFeedItems(items: FeedItem[]): Promise<EnrichResult> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      items,
      enrichedCount: 0,
      cacheHits: 0,
      skipped: true,
      error: "OPENAI_API_KEY missing — heuristic titles only",
    };
  }

  const cache = await loadCache();
  let cacheHits = 0;
  let enrichedCount = 0;
  let error: string | undefined;

  const withCache = items.map((item) => {
    const key = cacheKey(item);
    const hit = cache[key];
    if (hit?.headline) {
      cacheHits += 1;
      return applyEnrichment(item, hit);
    }
    return item;
  });

  const needsWork = withCache
    .map((item, index) => ({ item, index, key: cacheKey(items[index]) }))
    .filter(
      ({ item }) =>
        !item.tags?.includes("ai-headline") &&
        !item.tags?.includes("research-paper")
    )
    .sort((a, b) => {
      const sa =
        a.item.scores.impact * 0.45 +
        a.item.scores.relevance * 0.3 +
        a.item.scores.trend * 0.25;
      const sb =
        b.item.scores.impact * 0.45 +
        b.item.scores.relevance * 0.3 +
        b.item.scores.trend * 0.25;
      return sb - sa;
    })
    .slice(0, MAX_ENRICH_PER_RUN);

  if (needsWork.length === 0) {
    // Still prune on read-only hits so the file can't grow forever
    await saveCache(cache).catch(() => undefined);
    return { items: withCache, enrichedCount: 0, cacheHits, skipped: false };
  }

  try {
    await mapPool(needsWork, CONCURRENCY, async ({ item, index, key }) => {
      try {
        const enrichment = await enrichOne(item);
        if (!enrichment) return;
        cache[key] = enrichment;
        const next = applyEnrichment(item, enrichment);
        withCache[index] = next;
        enrichedCount += 1;
        await autoFlagIfNeeded(next).catch(() => undefined);
      } catch (err) {
        console.error("[openai-enrich] item failed", item.id, err);
        error = err instanceof Error ? err.message : String(err);
      }
    });
    await saveCache(cache);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    items: withCache,
    enrichedCount,
    cacheHits,
    skipped: false,
    error,
  };
}
