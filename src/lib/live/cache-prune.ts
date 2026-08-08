/** Keep disk JSON caches bounded by age + max entry count. */

export function pruneByAgeAndCap<T extends { [k: string]: unknown }>(
  cache: Record<string, T>,
  opts: {
    getTimestamp: (value: T) => string | undefined;
    maxAgeMs: number;
    maxEntries: number;
  }
): Record<string, T> {
  const cutoff = Date.now() - opts.maxAgeMs;
  const kept: { key: string; value: T; ts: number }[] = [];

  for (const [key, value] of Object.entries(cache)) {
    const raw = opts.getTimestamp(value);
    const ts = raw ? Date.parse(raw) : NaN;
    if (Number.isFinite(ts) && ts < cutoff) continue;
    kept.push({
      key,
      value,
      ts: Number.isFinite(ts) ? ts : Date.now(),
    });
  }

  kept.sort((a, b) => b.ts - a.ts);
  const next: Record<string, T> = {};
  for (const row of kept.slice(0, opts.maxEntries)) {
    next[row.key] = row.value;
  }
  return next;
}
