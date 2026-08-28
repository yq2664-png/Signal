/** Nested force-refresh depth — overlapping full crawls also bypass HTTP cache. */
let bypassHttpCacheDepth = 0;

export async function withBypassHttpCache<T>(
  fn: () => Promise<T>
): Promise<T> {
  bypassHttpCacheDepth += 1;
  try {
    return await fn();
  } finally {
    bypassHttpCacheDepth -= 1;
  }
}

export function liveFetchOptions(revalidateSec: number): RequestInit {
  if (bypassHttpCacheDepth > 0) return { cache: "no-store" };
  return { next: { revalidate: revalidateSec } };
}
