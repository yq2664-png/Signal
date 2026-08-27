import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { FeedPayload } from "@/lib/live/aggregate";
import { getCacheDir } from "@/lib/live/cache-dir";
import { publicReadUrl } from "@/lib/live/public-read-url";

function cacheFile() {
  return path.join(getCacheDir(), "feed-snapshot.json");
}

/** Serve / refresh cadence for the aggregated feed */
export const FEED_TTL_MS = 30 * 60 * 1000;

/**
 * Max time /api/feed may wait for a live crawl.
 * Railway Hikari closes the request around ~60–72s with 502 upstream error.
 */
export const FEED_REQUEST_WAIT_MS = 2_000;

type DiskSnapshot = {
  fetchedAt: string;
  payload: FeedPayload;
};

type MemoryEntry = {
  fetchedAtMs: number;
  payload: FeedPayload;
};

let memory: MemoryEntry | null = null;
let inflight: Promise<FeedPayload> | null = null;

async function loadDisk(): Promise<MemoryEntry | null> {
  try {
    const raw = await readFile(cacheFile(), "utf8");
    const parsed = JSON.parse(raw) as DiskSnapshot;
    if (!parsed?.payload?.items || !parsed.fetchedAt) return null;
    const fetchedAtMs = Date.parse(parsed.fetchedAt);
    if (!Number.isFinite(fetchedAtMs)) return null;
    return { fetchedAtMs, payload: parsed.payload };
  } catch {
    return null;
  }
}

async function saveDisk(entry: MemoryEntry): Promise<void> {
  await mkdir(getCacheDir(), { recursive: true });
  const snap: DiskSnapshot = {
    fetchedAt: new Date(entry.fetchedAtMs).toISOString(),
    payload: entry.payload,
  };
  const tmp = `${cacheFile()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(snap), "utf8");
  await rename(tmp, cacheFile());
}

function withCacheMeta(
  payload: FeedPayload,
  fetchedAtMs: number,
  fromCache: boolean
): FeedPayload {
  const ageMs = Math.max(0, Date.now() - fetchedAtMs);
  return {
    ...payload,
    items: payload.items.map((item) => ({
      ...item,
      url: publicReadUrl(item.url),
      officialLaunch: item.officialLaunch
        ? {
            ...item.officialLaunch,
            supportingSources: item.officialLaunch.supportingSources.map(
              (source) => ({
                ...source,
                url: publicReadUrl(source.url),
              })
            ),
          }
        : item.officialLaunch,
    })),
    meta: {
      ...payload.meta,
      fetchedAt: new Date(fetchedAtMs).toISOString(),
      fromCache,
      warming: false,
      cacheAgeSec: Math.round(ageMs / 1000),
      ttlSec: Math.round(FEED_TTL_MS / 1000),
    },
  };
}

function warmingPayload(): FeedPayload {
  return {
    items: [],
    insights: [],
    meta: {
      liveCount: 0,
      enrichedCount: 0,
      enrichCacheHits: 0,
      fetchedAt: new Date().toISOString(),
      errors: ["Feed snapshot is rebuilding"],
      fromCache: false,
      warming: true,
      cacheAgeSec: 0,
      ttlSec: Math.round(FEED_TTL_MS / 1000),
    },
  };
}

async function waitFor<T>(
  promise: Promise<T>,
  ms: number
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runFetch(
  fetchFresh: () => Promise<FeedPayload>
): Promise<FeedPayload> {
  if (inflight) return inflight;

  inflight = (async () => {
    const payload = await fetchFresh();
    const entry: MemoryEntry = {
      fetchedAtMs: Date.now(),
      payload,
    };
    memory = entry;
    await saveDisk(entry).catch((err) => {
      console.error("[feed-cache] failed to persist snapshot", err);
    });
    return withCacheMeta(payload, entry.fetchedAtMs, false);
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

function kickRefresh(fetchFresh: () => Promise<FeedPayload>): void {
  void runFetch(fetchFresh).catch((err) => {
    console.error("[feed-cache] refresh failed", err);
  });
}

/**
 * Fast feed access:
 * - Snapshot available: return immediately (refresh in background if stale/forced)
 * - No snapshot: start crawl, wait briefly, then return a 200 warming payload
 *
 * Never block the HTTP request on a full live aggregate — that 502s Railway.
 */
export async function getCachedFeed(
  fetchFresh: () => Promise<FeedPayload>,
  opts?: { force?: boolean }
): Promise<FeedPayload> {
  const force = Boolean(opts?.force);
  const now = Date.now();

  if (!memory) {
    memory = await loadDisk();
  }

  const stale = memory ? now - memory.fetchedAtMs >= FEED_TTL_MS : true;
  if (force || !memory || stale) {
    kickRefresh(fetchFresh);
  }

  if (memory) {
    return withCacheMeta(memory.payload, memory.fetchedAtMs, true);
  }

  if (inflight) {
    try {
      const done = await waitFor(inflight, FEED_REQUEST_WAIT_MS);
      if (done) return done;
    } catch (error) {
      console.error("[feed-cache] in-flight crawl failed", error);
    }
  }

  return warmingPayload();
}

export function resetFeedCacheForTests(): void {
  memory = null;
  inflight = null;
}
