import type { FeedItem } from "@/lib/types";

export const SEEN_POSTS_KEY = "signal-seen-posts-v1";
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

export function loadSeen(): SeenIndex {
  if (typeof window === "undefined") return EMPTY_SEEN;
  try {
    const raw = localStorage.getItem(SEEN_POSTS_KEY);
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

export function saveSeen(index: SeenIndex): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_POSTS_KEY, JSON.stringify(index));
  } catch {
    /* quota / private mode */
  }
}
