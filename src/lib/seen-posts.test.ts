import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSeen,
  EMPTY_SEEN,
  excludeSeen,
  hydrateSeen,
  isSeenItem,
  loadPending,
  loadSeen,
  mergeSeen,
  normalizeSeenUrl,
  savePending,
  saveSeen,
  prioritizeUnread,
} from "@/lib/seen-posts";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("seen posts", () => {
  it("keeps all 189 posts when only five are unread, preserving order in each group", () => {
    const posts = Array.from({ length: 189 }, (_, i) => ({
      id: String(i), url: `https://example.com/${i}`,
    }));
    const history = posts.slice(0, 184).reduce(addSeen, EMPTY_SEEN);
    const result = prioritizeUnread(posts, history);
    expect(result.items).toHaveLength(189);
    expect(result.items).toEqual([...posts.slice(184), ...posts.slice(0, 184)]);
    expect(result.caughtUp).toBe(false);
    expect(prioritizeUnread(posts, posts.reduce(addSeen, history)).items).toEqual(posts);
  });

  it("restores available posts when persisted reading history hides everything", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage });
    try {
      const posts = [{ id: "read", url: "https://example.com/read" }];
      savePending(addSeen(EMPTY_SEEN, posts[0]));
      const reloaded = hydrateSeen();
      expect(prioritizeUnread(posts, reloaded)).toEqual({ items: posts, caughtUp: true });
      expect(prioritizeUnread(posts, hydrateSeen())).toEqual({ items: posts, caughtUp: true });
      const fresh = { id: "new", url: "https://example.com/new" };
      expect(prioritizeUnread([...posts, fresh], reloaded)).toEqual({ items: [fresh, ...posts], caughtUp: false });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not label empty search results as caught up", () => {
    expect(prioritizeUnread([], EMPTY_SEEN)).toEqual({ items: [], caughtUp: false });
  });

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

  it("hides a card recorded by id when the url is missing", () => {
    const viewed = { id: "gpt-6-astra", url: "" };
    const other = { id: "other", url: "https://example.com/other" };
    const committed = addSeen(EMPTY_SEEN, viewed);
    expect(excludeSeen([viewed, other], committed).map((item) => item.id)).toEqual(
      ["other"]
    );
  });
});

describe("hydrateSeen", () => {
  beforeEach(() => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("commits leftover pending views so a page reload hides them", () => {
    const viewed = {
      id: "gpt-6-astra",
      url: "https://openai.com/index/gpt-6-astra",
    };
    const other = { id: "other", url: "https://example.com/other" };
    savePending(addSeen(EMPTY_SEEN, viewed));

    const committed = hydrateSeen();

    expect(isSeenItem(viewed, committed)).toBe(true);
    expect(loadPending()).toEqual(EMPTY_SEEN);
    expect(loadSeen().ids).toContain("gpt-6-astra");
    expect(
      excludeSeen([viewed, other], committed).map((item) => item.id)
    ).toEqual(["other"]);
  });

  it("keeps already-committed views when pending is empty", () => {
    const viewed = { id: "kimi-k25", url: "https://kimi.com/blog/kimi-k2-5" };
    saveSeen(addSeen(EMPTY_SEEN, viewed));

    const committed = hydrateSeen();

    expect(isSeenItem(viewed, committed)).toBe(true);
    expect(loadPending()).toEqual(EMPTY_SEEN);
  });

  it("hides viewport-flushed cards after they are committed", () => {
    const visible = { id: "on-screen", url: "https://example.com/on-screen" };
    const next = { id: "unseen", url: "https://example.com/unseen" };
    const pending = addSeen(EMPTY_SEEN, visible);
    const committed = mergeSeen(EMPTY_SEEN, pending);

    expect(excludeSeen([visible, next], committed).map((item) => item.id)).toEqual(
      ["unseen"]
    );
  });
});
