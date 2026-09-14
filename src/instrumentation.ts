export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startFeedWorker } = await import("@/lib/live/feed-worker");
  const runtime = globalThis as typeof globalThis & { stopSignalFeedWorker?: () => void };
  runtime.stopSignalFeedWorker ??= startFeedWorker();
}
