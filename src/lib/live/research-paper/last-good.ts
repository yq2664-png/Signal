import { mkdir, readFile, writeFile, rename } from "fs/promises";
import path from "path";
import { getCacheDir } from "../cache-dir";
import type { FeedItem } from "@/lib/types";

export async function retainResearchOnFailure(items: FeedItem[], options: { degraded: boolean; now: Date; cap: number; windowDays: number }): Promise<FeedItem[]> {
  const file = path.join(getCacheDir(), "research-last-good.json");
  let previous: FeedItem[] = [];
  try { const parsed = JSON.parse(await readFile(file, "utf8")); if (Array.isArray(parsed)) previous = parsed; } catch { /* First run. */ }
  const valid = (item: FeedItem) => {
    const timestamp = Date.parse(item.publishedAt);
    return item.researchPaper && Number.isFinite(timestamp) && timestamp <= options.now.getTime() && options.now.getTime() - timestamp <= options.windowDays * 86400_000;
  };
  const merged = new Map(items.map(item => [item.id, item]));
  if (options.degraded) for (const item of previous.filter(valid)) if (!merged.has(item.id)) merged.set(item.id, item);
  const result = [...merged.values()].slice(0, options.cap);
  try {
    await mkdir(getCacheDir(), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(result)); await rename(temp, file);
  } catch (error) { console.error("[research-snapshot]", error); }
  return result;
}
