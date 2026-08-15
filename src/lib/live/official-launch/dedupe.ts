import type {
  OfficialLaunchSourceRecord,
  QualifiedLaunchRecord,
} from "@/lib/types";
import type { OfficialLaunchDiagnosticsCollector } from "@/lib/live/official-launch/diagnostics";

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

export function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || TRACKING_PARAMS.has(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return raw.trim();
  }
}

/** Same-page changelog entries are distinct only by fragment identity. */
export function identityUrl(raw: string): string {
  try {
    const hash = new URL(raw).hash.replace(/^#/, "").toLowerCase();
    const canonical = canonicalizeUrl(raw);
    return hash ? `${canonical}#${hash}` : canonical;
  } catch {
    return canonicalizeUrl(raw);
  }
}

export function normalizeLaunchTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/\b(?:introducing|announcing|launching|releasing)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function exactKeys(record: OfficialLaunchSourceRecord): string[] {
  return [
    `source:${record.channelId}:${record.id}`,
    `url:${identityUrl(record.url)}`,
    `title:${record.organizationId}:${normalizeLaunchTitle(record.title)}`,
  ];
}

/** Exact, deterministic dedupe only. Semantic event merging happens later. */
export function deterministicDedupe<T extends OfficialLaunchSourceRecord>(
  records: T[],
  diagnostics?: OfficialLaunchDiagnosticsCollector
): T[] {
  const keys = new Map<string, T>();
  const sorted = [...records].sort(
    (a, b) =>
      b.authority - a.authority ||
      a.publishedAt.localeCompare(b.publishedAt) ||
      a.id.localeCompare(b.id)
  );
  const kept: T[] = [];

  for (const record of sorted) {
    const recordKeys = exactKeys(record);
    const duplicate = recordKeys.map((key) => keys.get(key)).find(Boolean);
    if (duplicate) {
      diagnostics?.record({
        candidateId: record.id,
        organizationId: record.organizationId,
        channelId: record.channelId,
        title: record.title,
        url: record.url,
        stage: "dedupe",
        status: "rejected",
        reason: "duplicate",
        method: "deterministic",
        targetId: duplicate.id,
      });
      continue;
    }
    kept.push(record);
    recordKeys.forEach((key) => keys.set(key, record));
  }
  return kept;
}

export function entityTokens(record: QualifiedLaunchRecord): string[] {
  return [
    record.entities.product,
    record.entities.model,
    record.entities.version
      ? `${record.entities.product || record.entities.model || "release"}:${record.entities.version}`
      : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/[^a-z0-9.-]+/g, ""));
}
