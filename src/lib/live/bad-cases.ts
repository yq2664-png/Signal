import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type {
  BadCaseReason,
  BadCaseRecord,
  FeedItem,
  Source,
} from "@/lib/types";
import { getCacheDir } from "@/lib/live/cache-dir";

const BAD_CASES_FILE = path.join(getCacheDir(), "bad-cases.json");

type Store = { cases: BadCaseRecord[] };

async function loadStore(): Promise<Store> {
  try {
    const raw = await readFile(BAD_CASES_FILE, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return { cases: Array.isArray(parsed.cases) ? parsed.cases : [] };
  } catch {
    return { cases: [] };
  }
}

async function saveStore(store: Store): Promise<void> {
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(BAD_CASES_FILE, JSON.stringify(store, null, 2), "utf8");
}

function makeId(itemId: string, reason: string, note: string): string {
  return createHash("sha256")
    .update(`${itemId}|${reason}|${note}|${Date.now()}`)
    .digest("hex")
    .slice(0, 16);
}

function snapshotFromItem(item: FeedItem): BadCaseRecord["snapshot"] {
  return {
    title: item.title,
    originalTitle: item.originalTitle,
    summary: item.summary,
    originalSummary: item.originalSummary,
    source: item.source,
    url: item.url,
    category: item.category,
    tier: item.tier,
    scores: item.scores,
    tags: item.tags,
  };
}

export async function reportBadCase(input: {
  item: FeedItem;
  reason: BadCaseReason;
  note?: string;
  origin?: "auto" | "user";
}): Promise<BadCaseRecord> {
  const store = await loadStore();
  const record: BadCaseRecord = {
    id: makeId(input.item.id, input.reason, input.note ?? ""),
    itemId: input.item.id,
    reason: input.reason,
    note: input.note?.trim() || undefined,
    snapshot: snapshotFromItem(input.item),
    createdAt: new Date().toISOString(),
    origin: input.origin ?? "user",
  };
  store.cases.unshift(record);
  // Cap store size
  store.cases = store.cases.slice(0, 500);
  await saveStore(store);
  return record;
}

/** Heuristic auto-flag after AI rewrite — feeds the optimization loop. */
export function detectTitleBadCase(item: FeedItem): string | null {
  const title = item.title.trim();
  if (!title) return "empty title";
  if (title.length < 18) return "title too short to convey who/what";
  if (/^v?\d+\.\d+/.test(title)) return "version tag left as title";
  if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(title))
    return "raw owner/repo left as title";
  // Prefer actor+verb pattern; soft check
  const hasVerb =
    /\b(launches?|releases?|introduces?|announces?|opens?|ships?|adds?|updates?|builds?|raises?|acquires?|partners?|rolls?\s*out|unveils?|publishes?|debuts?)\b/i.test(
      title
    );
  if (!hasVerb && title.length < 40) return "missing clear action verb (who did what)";
  return null;
}

export async function autoFlagIfNeeded(item: FeedItem): Promise<void> {
  const issue = detectTitleBadCase(item);
  if (!issue) return;
  // Deduplicate recent auto flags for same item+issue
  const store = await loadStore();
  const recent = store.cases.find(
    (c) =>
      c.itemId === item.id &&
      c.origin === "auto" &&
      c.note === issue &&
      Date.now() - new Date(c.createdAt).getTime() < 7 * 24 * 3600 * 1000
  );
  if (recent) return;
  await reportBadCase({
    item,
    reason: "title",
    note: issue,
    origin: "auto",
  });
}

export type BadCaseAnalysis = {
  total: number;
  byReason: Record<string, number>;
  bySource: Partial<Record<Source, number>>;
  byOrigin: Record<string, number>;
  topNotes: { note: string; count: number }[];
  recent: BadCaseRecord[];
  recommendations: string[];
};

export async function analyzeBadCases(limit = 40): Promise<BadCaseAnalysis> {
  const { cases } = await loadStore();
  const byReason: Record<string, number> = {};
  const bySource: Partial<Record<Source, number>> = {};
  const byOrigin: Record<string, number> = {};
  const noteCounts = new Map<string, number>();

  for (const c of cases) {
    byReason[c.reason] = (byReason[c.reason] ?? 0) + 1;
    bySource[c.snapshot.source] = (bySource[c.snapshot.source] ?? 0) + 1;
    byOrigin[c.origin] = (byOrigin[c.origin] ?? 0) + 1;
    if (c.note) noteCounts.set(c.note, (noteCounts.get(c.note) ?? 0) + 1);
  }

  const topNotes = [...noteCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([note, count]) => ({ note, count }));

  const recommendations: string[] = [];
  if ((byReason.title ?? 0) > (byReason.summary ?? 0)) {
    recommendations.push(
      "Title issues dominate — tighten who-did-what prompt and reject version/repo titles."
    );
  }
  if ((byReason.ranking ?? 0) >= 3) {
    recommendations.push(
      "Ranking complaints rising — raise qualityScore weight for engagement / lab releases."
    );
  }
  if ((byReason.relevance ?? 0) >= 3) {
    recommendations.push(
      "Relevance noise — expand requireAi filters or keyword denylist for off-topic items."
    );
  }
  const topSource = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];
  if (topSource && topSource[1] >= 3) {
    recommendations.push(
      `Most bad cases from ${topSource[0]} (${topSource[1]}) — audit that connector’s title/summary path.`
    );
  }
  if (recommendations.length === 0 && cases.length > 0) {
    recommendations.push(
      "No strong pattern yet — keep flagging edge cases to accumulate signal."
    );
  }

  return {
    total: cases.length,
    byReason,
    bySource,
    byOrigin,
    topNotes,
    recent: cases.slice(0, limit),
    recommendations,
  };
}

export async function listBadCases(limit = 50): Promise<BadCaseRecord[]> {
  const { cases } = await loadStore();
  return cases.slice(0, limit);
}
