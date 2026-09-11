import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FeedItem } from "@/lib/types";
const disk = vi.hoisted(() => ({ readFile: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn(), rename: vi.fn() }));
vi.mock("fs/promises", () => disk);
const item = { id: "one", title: "Model launch", summary: "A new model" } as FeedItem;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  disk.readFile.mockRejectedValue(new Error("ENOENT"));
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("returns originals immediately, shares in-flight work and persists reusable translations", async () => {
  let finish!: (value: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const { getFeedTranslations } = await import("./feed-translations");
  expect(await getFeedTranslations([item])).toEqual({ translations: {}, pending: true });
  await getFeedTranslations([item]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  finish(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ id: "one", title: "模型发布", summary: "一款新模型" }] }) } }] })));
  await vi.waitFor(() => expect(disk.rename).toHaveBeenCalledTimes(1));
  const result = await getFeedTranslations([{ ...item, id: "new-id" }]);
  expect(result.pending).toBe(false);
  expect(result.translations["new-id"].title).toBe("模型发布");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("backs off on service errors while keeping the feed available", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  const { getFeedTranslations } = await import("./feed-translations");
  await getFeedTranslations([item]);
  await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  expect(await getFeedTranslations([item])).toEqual({ translations: {}, pending: false });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("uses original text with no model key and tolerates malformed cache files", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  disk.readFile.mockResolvedValue("null");
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const { getFeedTranslations } = await import("./feed-translations");
  expect(await getFeedTranslations([item])).toEqual({ translations: {}, pending: false });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("invalidates translations when source content changes", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const service = await import("./feed-translations");
  disk.readFile.mockResolvedValue(JSON.stringify({ [service.translationKey(item)]: { sourceTitle: item.title, sourceSummary: item.summary, title: "模型发布", summary: "一款新模型" } }));
  expect((await service.getFeedTranslations([item])).translations.one.title).toBe("模型发布");
  expect((await service.getFeedTranslations([{ ...item, summary: "Corrected" }])).translations).toEqual({});
});
