import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "./cache-dir";
import { getFeedTranslations } from "./feed-translations";
import type { FeedPayload } from "./aggregate";
import type { FeedItem } from "@/lib/types";

let published: FeedPayload | undefined;
let loaded: Promise<void> | undefined;
let serial = Promise.resolve();
const file = () => path.join(getCacheDir(), "feed-bilingual.json");

/** Background only: enqueue both languages, even when no reader is connected. */
export async function prepareBilingualFeed(feed: FeedPayload) {
  await Promise.all([getFeedTranslations(feed.items, "en"), getFeedTranslations(feed.items, "zh")]);
  return publishBilingualFeed(feed);
}

/** Reads cached translations only; never waits for or starts a model request. */
export async function publishBilingualFeed(feed: FeedPayload): Promise<FeedPayload> {
  // Serialize publication so an older disk write cannot overwrite a newer one.
  const result = serial.then(async () => {
    loaded ??= (async () => {
      try {
        const saved = JSON.parse(await readFile(file(), "utf8")) as FeedPayload;
        if (Array.isArray(saved.items) && saved.items.every(item => item.translations?.en && item.translations?.zh)) published = saved;
      } catch { /* First publication. */ }
    })();
    await loaded;
    if (published && Date.parse(published.meta.fetchedAt) > Date.parse(feed.meta.fetchedAt)) return published;
    const [en, zh] = await Promise.all([
      getFeedTranslations(feed.items, "en", true), getFeedTranslations(feed.items, "zh", true),
    ]);
    const readyEn = new Set(en.readyIds), readyZh = new Set(zh.readyIds);
    const old = new Map(published?.items.map(item => [item.id, item]) ?? []);
    const items: FeedItem[] = [];
    let pending = 0;
    for (const item of feed.items) {
      if (readyEn.has(item.id) && readyZh.has(item.id)) {
        const content = (entry: typeof en.translations[string]) => ({ title: entry.title, summary: entry.summary, ...(item.brief ? { brief: entry.brief } : {}) });
        items.push({ ...item, translations: { en: content(en.translations[item.id]), zh: content(zh.translations[item.id]) } });
      } else {
        pending++;
        const previous = old.get(item.id);
        if (previous) items.push(previous);
      }
    }
    // A cold crawl must not clear the durable, already bilingual snapshot.
    if (feed.meta.warming && !feed.items.length && published) items.push(...published.items);
    const next: FeedPayload = {
      ...feed, items,
      meta: { ...feed.meta, liveCount: items.length, translationPending: pending,
        warming: !items.length && (Boolean(feed.meta.warming) || pending > 0),
      },
    };
    if (JSON.stringify(next) !== JSON.stringify(published)) {
      await mkdir(getCacheDir(), { recursive: true });
      await writeFile(`${file()}.${process.pid}.tmp`, JSON.stringify(next));
      await rename(`${file()}.${process.pid}.tmp`, file());
      published = next;
    }
    return next;
  });
  serial = result.then(() => {}, () => {});
  return result;
}
