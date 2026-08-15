import { NextResponse } from "next/server";
import { listResearchPaperRuns } from "@/lib/live/research-paper";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("limit") || 20);
  const limit = Number.isFinite(requested) ? requested : 20;
  const runs = await listResearchPaperRuns(limit);
  return NextResponse.json({ runs });
}
