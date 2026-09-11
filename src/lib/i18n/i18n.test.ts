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
