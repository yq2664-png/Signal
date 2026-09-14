import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cached: vi.fn(), prepare: vi.fn(), aggregate: vi.fn() }));
vi.mock("./aggregate", () => ({ getAggregatedFeed: mocks.aggregate }));
vi.mock("./feed-cache", () => ({ getCachedFeed: mocks.cached }));
vi.mock("./feed-publication", () => ({ prepareBilingualFeed: mocks.prepare }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });
it("prepares at startup and retries periodically without any HTTP request", async () => {
  vi.useFakeTimers(); vi.spyOn(console, "error").mockImplementation(() => {});
  const payload = { items: [] }; mocks.cached.mockResolvedValue(payload);
  mocks.prepare.mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValue(undefined);
  const { startFeedWorker } = await import("./feed-worker");
  const stop = startFeedWorker();
  await vi.advanceTimersByTimeAsync(500);
  expect(mocks.prepare).toHaveBeenCalledWith(payload);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  stop(); await vi.advanceTimersByTimeAsync(120_000);
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
});
