import { getAggregatedFeed } from "./aggregate";
import { getCachedFeed } from "./feed-cache";
import { prepareBilingualFeed } from "./feed-publication";

/** The persistent Railway server owns this loop; browser traffic is unnecessary. */
export function startFeedWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    try { await prepareBilingualFeed(await getCachedFeed(getAggregatedFeed)); }
    catch (error) { console.error("[feed-worker]", error); }
    if (!stopped) { timer = setTimeout(tick, 60_000); timer.unref?.(); }
  };
  timer = setTimeout(tick, 500);
  timer.unref?.();
  return () => { stopped = true; clearTimeout(timer); };
}
