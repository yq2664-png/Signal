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
  expect(await getFeedTranslations([item])).toMatchObject({ translations: {}, pending: true });
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
  const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
  vi.stubGlobal("fetch", fetchMock);
  const { getFeedTranslations } = await import("./feed-translations");
  await getFeedTranslations([item]);
  await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  expect(await getFeedTranslations([item])).toMatchObject({ translations: {}, pending: true, remaining: 1 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("uses original text with no model key and tolerates malformed cache files", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  disk.readFile.mockResolvedValue("null");
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const { getFeedTranslations } = await import("./feed-translations");
  expect(await getFeedTranslations([item])).toMatchObject({ translations: {}, pending: false });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("invalidates translations when source content changes", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const service = await import("./feed-translations");
  disk.readFile.mockResolvedValue(JSON.stringify({ [service.translationKey(item)]: { sourceTitle: item.title, sourceSummary: item.summary, title: "模型发布", summary: "一款新模型" } }));
  expect((await service.getFeedTranslations([item])).translations.one.title).toBe("模型发布");
  expect((await service.getFeedTranslations([{ ...item, summary: "Corrected" }])).translations).toEqual({});
});
it("retains good rows, finishes more than 60 posts and retries bad rows after all others", async () => {
  const items = Array.from({ length: 65 }, (_, i) => ({ ...item, id: String(i), title: `Post ${i}` }));
  const requests: string[][] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    const input = JSON.parse(body.messages[1].content) as FeedItem[];
    requests.push(input.map(post => post.id));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: input.map(post => ({
      id: post.id, title: "中文标题", summary: post.id === "0" ? null : "中文摘要",
    })) }) } }] }));
  }));
  const { getFeedTranslations } = await import("./feed-translations");
  await getFeedTranslations(items);
  await vi.waitFor(() => expect(disk.rename).toHaveBeenCalledTimes(23));
  const result = await getFeedTranslations(items);
  expect(Object.keys(result.translations)).toHaveLength(64);
  expect(result.translations["64"].title).toBe("中文标题");
  expect(result.translations["0"]).toBeUndefined();
  expect(requests.at(-1)).toEqual(["0"]);
  expect(result.pending).toBe(true);
  expect(result.remaining).toBe(1);
  expect(requests).toHaveLength(23);
});
it("upgrades a title-only cache with all brief paragraphs without losing existing titles", async () => {
  const brief = { whatHappened: "A model launched", whyItMatters: "It adds a tool", potentialImpact: "It may help teams", keyTakeaway: "Try the tool" };
  const post = { ...item, brief };
  const translated = { whatHappened: "发布了一款模型", whyItMatters: "新增了一项工具", potentialImpact: "可能帮助团队", keyTakeaway: "尝试该工具" };
  let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const service = await import("./feed-translations");
  disk.readFile.mockResolvedValue(JSON.stringify({ [service.translationKey(post)]: { sourceTitle: post.title, sourceSummary: post.summary, title: "模型发布", summary: "新模型" } }));
  const initial = await service.getFeedTranslations([post]);
  expect(initial.translations.one.title).toBe("模型发布");
  expect(initial.pending).toBe(true);
  finish(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ id: "one", title: "模型发布", summary: "新模型", brief: translated }] }) } }] })));
  await vi.waitFor(() => expect(disk.rename).toHaveBeenCalledTimes(1));
  const result = await service.getFeedTranslations([post]);
  expect(result.translations.one.brief).toEqual(translated);
  expect(result.translations.one.sourceBrief).toEqual(brief);
  expect(result.pending).toBe(false);
});
it("keeps English and Chinese requests, workers and persisted caches separate", async () => {
  const post = { ...item, title: "发布新模型", summary: "支持本地部署" };
  const prompts: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    const prompt = body.messages[0].content as string;
    prompts.push(prompt);
    const en = prompt.includes("fluent English");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ id: "one", title: en ? "New model released" : "新模型发布", summary: en ? "Supports local deployment" : "支持本地部署" }] }) } }] }));
  }));
  const { getFeedTranslations } = await import("./feed-translations");
  await Promise.all([getFeedTranslations([post], "en"), getFeedTranslations([post], "zh")]);
  await vi.waitFor(() => expect(disk.rename).toHaveBeenCalledTimes(2));
  const en = await getFeedTranslations([post], "en");
  const zh = await getFeedTranslations([post], "zh");
  expect(en.translations.one.title).toBe("New model released");
  expect(en.translations.one.locale).toBe("en");
  expect(zh.translations.one.title).toBe("新模型发布");
  expect(prompts.some(p => p.includes("fluent English"))).toBe(true);
  expect(disk.rename.mock.calls.map(call => call[1])).toEqual(expect.arrayContaining([expect.stringContaining("-en-v1.json"), expect.stringContaining("-zh-v1.json")]));
});
it("continues after a timed-out batch and retries its rows individually", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  let calls = 0;
  const posts = Array.from({ length: 4 }, (_, i) => ({ ...item, id: String(i), title: `Title ${i}` }));
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
    if (++calls === 1) throw new Error("timeout");
    const input = JSON.parse(JSON.parse(String(options.body)).messages[1].content) as FeedItem[];
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: input.map(post => ({ id: post.id, title: "译文", summary: "摘要" })) }) } }] }));
  }));
  const { getFeedTranslations } = await import("./feed-translations");
  await getFeedTranslations(posts);
  await vi.waitFor(() => expect(disk.rename).toHaveBeenCalledTimes(4));
  const result = await getFeedTranslations(posts);
  expect(Object.keys(result.translations)).toHaveLength(4);
  expect(result.remaining).toBe(0);
  expect(result.pending).toBe(false);
  expect(calls).toBe(5);
});

it("detects untranslated prose without rejecting product names or hashtags", async () => {
  const { wrongTranslationLanguage } = await import("./feed-translations");
  expect(wrongTranslationLanguage("Grok Bot is now included with more plans", "zh")).toBe(true);
  expect(wrongTranslationLanguage("GPT-6 Astra", "zh")).toBe(false);
  expect(wrongTranslationLanguage("Grok Bot 现已包含在更多套餐中", "zh")).toBe(false);
  expect(wrongTranslationLanguage("发布新模型", "en")).toBe(true);
  expect(wrongTranslationLanguage("New model released #人工智能", "en")).toBe(false);
});
it("requeues cached titles that are still in the wrong language", async () => {
  const post = { ...item, title: "Grok Bot is now included with more plans" };
  const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  const service = await import("./feed-translations");
  disk.readFile.mockResolvedValue(JSON.stringify({ [service.translationKey(post)]: {
    sourceTitle: post.title, sourceSummary: post.summary,
    title: post.title, summary: "中文摘要",
  } }));
  const result = await service.getFeedTranslations([post], "zh");
  expect(result.pending).toBe(true);
  expect(result.remaining).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
