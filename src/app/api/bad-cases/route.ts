import { NextResponse } from "next/server";
import {
  analyzeBadCases,
  listBadCases,
  reportBadCase,
} from "@/lib/live/bad-cases";
import type { BadCaseReason, FeedItem } from "@/lib/types";

const REASONS: BadCaseReason[] = [
  "title",
  "summary",
  "ranking",
  "relevance",
  "other",
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "list";
  if (mode === "analysis") {
    const analysis = await analyzeBadCases();
    return NextResponse.json(analysis);
  }
  const cases = await listBadCases(80);
  return NextResponse.json({ cases });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      reason?: string;
      note?: string;
      item?: FeedItem;
    };

    if (!body.item?.id || !body.item?.title) {
      return NextResponse.json({ error: "item required" }, { status: 400 });
    }
    const reason = REASONS.includes(body.reason as BadCaseReason)
      ? (body.reason as BadCaseReason)
      : "other";

    const record = await reportBadCase({
      item: body.item,
      reason,
      note: body.note,
      origin: "user",
    });

    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save bad case", detail: String(error) },
      { status: 500 }
    );
  }
}
