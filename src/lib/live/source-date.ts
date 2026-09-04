/** Parse a source-native timestamp. Never falls back to crawl/now. */
export function parseSourceDate(
  raw?: string | number | Date | null
): string | undefined {
  if (raw == null || raw === "") return undefined;

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) && date.getTime() > 0
      ? date.toISOString()
      : undefined;
  }

  const date = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return undefined;
  return date.toISOString();
}

export function isVerifiedPublishedAt(iso?: string | null): boolean {
  return Boolean(parseSourceDate(iso));
}
