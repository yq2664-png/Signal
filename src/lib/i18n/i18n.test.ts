import { describe, expect, it } from "vitest";
import { localizeItem, resolveLocale, translateUI } from "./index";
import type { FeedItem } from "@/lib/types";
const item = { id: "post", title: "New model", summary: "Released today", url: "https://example.com", source: "OpenAI" } as FeedItem;
const translations = { post: { sourceTitle: item.title, sourceSummary: item.summary, title: "新模型", summary: "今日发布" } };
describe("bilingual presentation", () => {
  it("prefers remembered choice and otherwise follows browser language", () => {
    expect(resolveLocale("en", "zh-CN")).toBe("en");
    expect(resolveLocale("zh", "en-US")).toBe("zh");
    expect(resolveLocale(null, "zh-TW")).toBe("zh");
    expect(resolveLocale("bad", "fr")).toBe("en");
  });
  it("keeps source data and identity intact when presenting translations", () => {
    expect(localizeItem(item, "zh", translations)).toEqual({ ...item, title: "新模型", summary: "今日发布" });
    expect(item.title).toBe("New model");
    expect(localizeItem(item, "en", translations)).toBe(item);
    expect(localizeItem(item, "zh", {})).toBe(item);
  });
  it("rejects stale translations when the title or summary changes", () => {
    const updated = { ...item, summary: "Correction" };
    expect(localizeItem(updated, "zh", translations)).toBe(updated);
  });
  it("translates dynamic library text without changing account identifiers", () => {
    expect(translateUI("12 saved · synced to test@example.com", "zh")).toBe("12 条收藏 · 已同步至 test@example.com");
    expect(translateUI("Flagged · Unclear title", "zh")).toBe("已反馈 · 标题不清楚");
    expect(translateUI("Unknown source", "zh")).toBe("Unknown source");
  });
});
it("switches all brief paragraphs together and rejects stale brief translations", () => {
  const brief = { whatHappened: "Released", whyItMatters: "Useful", potentialImpact: "May help", keyTakeaway: "Try it" };
  const translated = { whatHappened: "已发布", whyItMatters: "具有实用价值", potentialImpact: "可能有帮助", keyTakeaway: "尝试使用" };
  const post = { ...item, brief };
  const cache = { post: { ...translations.post, sourceBrief: brief, brief: translated } };
  expect(localizeItem(post, "zh", cache).brief).toEqual(translated);
  expect(localizeItem(post, "en", cache)).toBe(post);
  const changed = { ...post, brief: { ...brief, potentialImpact: "Correction" } };
  expect(localizeItem(changed, "zh", cache).brief).toBe(changed.brief);
});
it("uses English translations for Chinese posts, never a Chinese cache entry", () => {
  const post = { ...item, title: "新模型发布", summary: "支持本地部署" };
  const en = { post: { locale: "en" as const, sourceTitle: post.title, sourceSummary: post.summary, title: "New model released", summary: "Supports local deployment" } };
  expect(localizeItem(post, "en", en).title).toBe("New model released");
  expect(localizeItem(post, "zh", en)).toBe(post);
  expect(translateUI("量子位", "en")).toBe("QbitAI");
});

it("uses the bilingual revision embedded in a post without a translation request", () => {
  const post = { id: "embedded", title: "Original", summary: "Source", translations: {
    zh: { title: "中文标题", summary: "中文摘要" }, en: { title: "English title", summary: "English summary" },
  } } as FeedItem;
  expect(localizeItem(post, "zh", {}).title).toBe("中文标题");
  expect(localizeItem(post, "en", {}).title).toBe("English title");
});

it("translates topic chips and compound labels while preserving names and identifiers", () => {
  expect(translateUI("Arms / Manipulators", "zh")).toBe("机械臂 / 操作器");
  expect(translateUI("Humanoid-robots", "zh")).toBe("人形机器人");
  expect(translateUI("cs.AI · Agents", "zh")).toBe("cs.AI · 智能体");
  expect(translateUI("OpenAI · Official", "zh")).toBe("OpenAI · 官方");
  expect(translateUI("3 official sources", "zh")).toBe("3 个官方来源");
  expect(translateUI("FRICTION · 9 evidence · 3d", "zh")).toBe("使用障碍 · 9 条证据 · 3 天");
  expect(translateUI("Arms / Manipulators", "en")).toBe("Arms / Manipulators");
  expect(translateUI("Python", "zh")).toBe("Python");
  expect(translateUI("Brianna Wessling", "zh")).toBe("Brianna Wessling");
});
