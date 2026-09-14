import { NextResponse } from "next/server";
import { getAggregatedFeed } from "@/lib/live/aggregate";
import { getCachedFeed } from "@/lib/live/feed-cache";
import { getFeedTranslations } from "@/lib/live/feed-translations";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const feed = await getCachedFeed(getAggregatedFeed);
    const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "zh";
    const result = await getFeedTranslations(feed.items, locale, true);
    return NextResponse.json({ ...result, pending: result.pending || Boolean(feed.meta.warming) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ translations: {}, pending: false }, { status: 503 });
  }
}
