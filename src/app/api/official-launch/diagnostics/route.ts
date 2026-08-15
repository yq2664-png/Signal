import { NextResponse } from "next/server";
import { listOfficialLaunchRuns } from "@/lib/live/official-launch/diagnostics";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("limit") || 20);
  const limit = Number.isFinite(requested) ? requested : 20;
  const runs = await listOfficialLaunchRuns(limit);
  return NextResponse.json({ runs });
}
