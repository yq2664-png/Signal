import type { FeedItem } from "@/lib/types";

export const SEEN_POSTS_KEY = "signal-seen-posts-v1";
export const SEEN_PENDING_KEY = "signal-seen-posts-pending-v1";
const MAX_SEEN = 800;

export type SeenIndex = {
  ids: string[];
  urls: string[];
};

export const EMPTY_SEEN: SeenIndex = { ids: [], urls: [] };

export function normalizeSeenUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function addSeen(index: SeenIndex, item: Pick<FeedItem, "id" | "url">): SeenIndex {
  const url = normalizeSeenUrl(item.url);
  const ids = index.ids.includes(item.id) ? index.ids : [...index.ids, item.id];
  const urls =
    url && !index.urls.includes(url) ? [...index.urls, url] : index.urls;
  return {
    ids: ids.slice(-MAX_SEEN),
    urls: urls.slice(-MAX_SEEN),
  };
}

export function mergeSeen(left: SeenIndex, right: SeenIndex): SeenIndex {
  const ids = [...left.ids];
  const urls = [...left.urls];
  for (const id of right.ids) {
    if (!ids.includes(id)) ids.push(id);
  }
  for (const url of right.urls) {
    if (!urls.includes(url)) urls.push(url);
  }
  return { ids: ids.slice(-MAX_SEEN), urls: urls.slice(-MAX_SEEN) };
}

export function isSeenItem(
  item: Pick<FeedItem, "id" | "url">,
  index: SeenIndex
): boolean {
  if (index.ids.includes(item.id)) return true;
  const url = normalizeSeenUrl(item.url);
  return Boolean(url) && index.urls.includes(url);
}

export function excludeSeen<T extends Pick<FeedItem, "id" | "url">>(
  items: T[],
  index: SeenIndex
): T[] {
  if (index.ids.length === 0 && index.urls.length === 0) return items;
  return items.filter((item) => !isSeenItem(item, index));
}

/** Stable unread-first ordering without removing available posts. */
export function prioritizeUnread<T extends Pick<FeedItem, "id" | "url">>(
  items: T[],
  index: SeenIndex
): { items: T[]; caughtUp: boolean } {
  const unread: T[] = [];
  const read: T[] = [];
  for (const item of items) {
    (isSeenItem(item, index) ? read : unread).push(item);
  }
  const caughtUp = items.length > 0 && unread.length === 0;
  return { items: [...unread, ...read], caughtUp };
}

function readIndex(key: string): SeenIndex {
  if (typeof window === "undefined") return EMPTY_SEEN;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY_SEEN;
    const parsed = JSON.parse(raw) as Partial<SeenIndex>;
    return {
      ids: Array.isArray(parsed.ids) ? parsed.ids.filter(Boolean) : [],
      urls: Array.isArray(parsed.urls) ? parsed.urls.filter(Boolean) : [],
    };
  } catch {
    return EMPTY_SEEN;
  }
}

function writeIndex(key: string, index: SeenIndex): void {
  if (typeof window === "undefined") return;
  try {
    if (index.ids.length === 0 && index.urls.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(index));
  } catch {
    /* quota / private mode */
  }
}

export function loadSeen(): SeenIndex {
  return readIndex(SEEN_POSTS_KEY);
}

export function saveSeen(index: SeenIndex): void {
  writeIndex(SEEN_POSTS_KEY, index);
}

export function loadPending(): SeenIndex {
  return readIndex(SEEN_PENDING_KEY);
}

export function savePending(index: SeenIndex): void {
  writeIndex(SEEN_PENDING_KEY, index);
}

/** Reload / new session: leftover pending views join the hidden pool. */
export function hydrateSeen(): SeenIndex {
  const committed = loadSeen();
  const pending = loadPending();
  if (pending.ids.length === 0 && pending.urls.length === 0) return committed;
  const next = mergeSeen(committed, pending);
  saveSeen(next);
  savePending(EMPTY_SEEN);
  return next;
}
