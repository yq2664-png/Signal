import { NextRequest, NextResponse } from "next/server";
import { getAggregatedFeed } from "@/lib/live/aggregate";
import { FEED_TTL_MS, getCachedFeed } from "@/lib/live/feed-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const payload = await getCachedFeed(getAggregatedFeed, { force });
    const maxAge = Math.round(FEED_TTL_MS / 1000);
    return NextResponse.json(
      {
        insights: payload.insights ?? [],
        meta: payload.meta,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`,
        },
      }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to build insights", detail: String(error) },
      { status: 500 }
    );
  }
}
