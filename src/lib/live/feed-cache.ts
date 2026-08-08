import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { FeedPayload } from "@/lib/live/aggregate";
import { getCacheDir } from "@/lib/live/cache-dir";

const CACHE_FILE = path.join(getCacheDir(), "feed-snapshot.json");

/** Serve / refresh cadence for the aggregated feed */
export const FEED_TTL_MS = 30 * 60 * 1000;

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
    const raw = await readFile(CACHE_FILE, "utf8");
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
  const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
  // Compact JSON — snapshot is replaced wholesale each refresh (~feed size)
  await writeFile(tmp, JSON.stringify(snap), "utf8");
  await rename(tmp, CACHE_FILE);
}

function withCacheMeta(
  payload: FeedPayload,
  fetchedAtMs: number,
  fromCache: boolean
): FeedPayload {
  const ageMs = Math.max(0, Date.now() - fetchedAtMs);
  return {
    ...payload,
    meta: {
      ...payload.meta,
      fetchedAt: new Date(fetchedAtMs).toISOString(),
      fromCache,
      cacheAgeSec: Math.round(ageMs / 1000),
      ttlSec: Math.round(FEED_TTL_MS / 1000),
    },
  };
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

/**
 * Fast feed access:
 * - Fresh snapshot (< 30m): return immediately
 * - Stale snapshot: return immediately + refresh in background
 * - No snapshot / force: await a full aggregate
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

  if (!force && memory) {
    const age = now - memory.fetchedAtMs;
    const fresh = age < FEED_TTL_MS;
    const payload = withCacheMeta(memory.payload, memory.fetchedAtMs, true);

    if (!fresh && !inflight) {
      void runFetch(fetchFresh).catch((err) => {
        console.error("[feed-cache] background refresh failed", err);
      });
    }

    return payload;
  }

  if (force && inflight) {
    return inflight;
  }

  return runFetch(fetchFresh);
}
