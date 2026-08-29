import { describe, expect, it } from "vitest";
import {
  addSeen,
  excludeSeen,
  isSeenItem,
  mergeSeen,
  normalizeSeenUrl,
} from "@/lib/seen-posts";

describe("seen posts", () => {
  it("treats www and trailing slash as the same URL", () => {
    expect(normalizeSeenUrl("https://www.kimi.com/blog/kimi-k3/")).toBe(
      normalizeSeenUrl("https://kimi.com/blog/kimi-k3")
    );
  });

  it("keeps viewed items visible until they are committed", () => {
    const viewed = { id: "kimi-k25", url: "https://www.kimi.com/blog/kimi-k2-5" };
    const other = { id: "openai-1", url: "https://openai.com/index/gpt" };
    const pending = addSeen({ ids: [], urls: [] }, viewed);
    expect(excludeSeen([viewed, other], { ids: [], urls: [] })).toEqual([
      viewed,
      other,
    ]);
    expect(excludeSeen([viewed, other], pending).map((item) => item.id)).toEqual([
      "openai-1",
    ]);
  });

  it("matches a recrawled card by URL when the feed id changes", () => {
    const committed = addSeen(
      { ids: [], urls: [] },
      { id: "old-id", url: "https://github.com/langflow-ai/langflow" }
    );
    expect(
      isSeenItem(
        { id: "new-id", url: "https://www.github.com/langflow-ai/langflow/" },
        committed
      )
    ).toBe(true);
  });

  it("merges pending views into the committed pool", () => {
    const committed = addSeen(
      { ids: [], urls: [] },
      { id: "a", url: "https://a.example/a" }
    );
    const pending = addSeen(
      { ids: [], urls: [] },
      { id: "b", url: "https://b.example/b" }
    );
    const merged = mergeSeen(committed, pending);
    expect(merged.ids).toEqual(["a", "b"]);
    expect(
      excludeSeen(
        [
          { id: "a", url: "https://a.example/a" },
          { id: "b", url: "https://b.example/b" },
          { id: "c", url: "https://c.example/c" },
        ],
        merged
      ).map((item) => item.id)
    ).toEqual(["c"]);
  });
});
