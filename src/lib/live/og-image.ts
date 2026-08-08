import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import { pruneByAgeAndCap } from "@/lib/live/cache-prune";

type OgCache = Record<string, { imageUrl?: string; checkedAt: string }>;

const CACHE_PATH = path.join(getCacheDir(), "og-images.json");
const OG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OG_MAX_ENTRIES = 800;

async function loadCache(): Promise<OgCache> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as OgCache;
  } catch {
    return {};
  }
}

async function saveCache(cache: OgCache): Promise<void> {
  const pruned = pruneByAgeAndCap(cache, {
    getTimestamp: (v) => v.checkedAt,
    maxAgeMs: OG_MAX_AGE_MS,
    maxEntries: OG_MAX_ENTRIES,
  });
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(pruned), "utf8");
}

function cleanImageUrl(raw: string): string {
  return raw
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractOgImage(html: string): string | undefined {
  const patterns = [
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return cleanImageUrl(m[1]);
  }
  return undefined;
}

async function fetchOneOg(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    return extractOgImage(html);
  } catch {
    return undefined;
  }
}

/** Fill missing imageUrl from page OG tags (cached on disk). */
export async function enrichOgImages<T extends { url: string; imageUrl?: string }>(
  items: T[],
  limit = 24
): Promise<T[]> {
  const need = items.filter((i) => !i.imageUrl && i.url).slice(0, limit);
  if (need.length === 0) return items;

  const cache = await loadCache();
  const updates = new Map<string, string | undefined>();

  // Resolve from cache first (re-clean in case old entries stored &amp;)
  const toFetch: string[] = [];
  for (const item of need) {
    const hit = cache[item.url];
    if (hit) {
      updates.set(
        item.url,
        hit.imageUrl ? cleanImageUrl(hit.imageUrl) : undefined
      );
    } else {
      toFetch.push(item.url);
    }
  }

  // Fetch remaining with small concurrency
  const concurrency = 4;
  for (let i = 0; i < toFetch.length; i += concurrency) {
    const batch = toFetch.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((url) => fetchOneOg(url)));
    batch.forEach((url, idx) => {
      const imageUrl = results[idx];
      updates.set(url, imageUrl);
      cache[url] = {
        imageUrl,
        checkedAt: new Date().toISOString(),
      };
    });
  }

  if (toFetch.length > 0) {
    await saveCache(cache).catch(() => undefined);
  }

  return items.map((item) => {
    if (item.imageUrl) {
      return { ...item, imageUrl: cleanImageUrl(item.imageUrl) };
    }
    const found = updates.get(item.url);
    return found ? { ...item, imageUrl: found } : item;
  });
}
