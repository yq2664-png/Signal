import { NextResponse } from "next/server";
import {
  applyReviewAction,
  listReviewQueue,
  type ReviewAction,
} from "@/lib/live/research-paper/queue";

const ACTIONS = new Set<ReviewAction>([
  "confirm-rejection",
  "move-to-watch",
  "approve-publish",
  "mark-error",
  "add-note",
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  const records = await listReviewQueue(
    state === "watch" || state === "review-queue" ? state : undefined
  );
  return NextResponse.json({
    records: records.map((record) => ({
      id: record.id,
      title: record.title,
      venue: record.venue,
      arxivId: record.arxivId,
      doi: record.doi,
      topic: record.topic,
      decisionRule: record.decisionRule,
      rejectionReason: record.rejectionReason,
      evidence: record.evidence,
      timestamp: record.timestamp,
      state: record.state,
      override: record.override,
      classificationError: record.classificationError,
      notes: record.notes,
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    action?: string;
    note?: string;
  };
  if (!body.id || !body.action || !ACTIONS.has(body.action as ReviewAction)) {
    return NextResponse.json({ error: "invalid-action" }, { status: 400 });
  }
  const record = await applyReviewAction({
    id: body.id,
    action: body.action as ReviewAction,
    note: body.note,
  });
  if (!record) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  return NextResponse.json({ record });
}
