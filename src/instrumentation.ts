export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getAggregatedFeed } = await import("@/lib/live/aggregate");
  const { getCachedFeed } = await import("@/lib/live/feed-cache");

  setTimeout(() => {
    void getCachedFeed(getAggregatedFeed).catch((error) => {
      console.error("[feed-warmup] failed", error);
    });
  }, 500);
}
