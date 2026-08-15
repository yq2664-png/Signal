import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import type { CommunitySignal, DeveloperCommunityStatus } from "@/lib/types";

export type CommunityReviewRecord = {
  id: string;
  state: "watch" | "review-queue";
  title: string;
  signalId: string;
  reason?: string;
  evidence: string;
  timestamp: string;
  notes: string[];
};

function queueFile(): string {
  return path.join(getCacheDir(), "developer-community-queue.json");
}

export async function persistCommunityQueue(
  signals: CommunitySignal[]
): Promise<void> {
  const records: CommunityReviewRecord[] = signals
    .filter(
      (signal) =>
        signal.status === "WATCH" || signal.status === "REVIEW_QUEUE"
    )
    .map((signal) => ({
      id: randomUUID(),
      state: signal.status === "WATCH" ? "watch" : "review-queue",
      title: signal.summary,
      signalId: signal.signalId,
      reason: signal.reason,
      evidence: signal.evidence
        .map((item) => item.sourceUrl)
        .slice(0, 5)
        .join(" "),
      timestamp: new Date().toISOString(),
      notes: [],
    }));
  await mkdir(getCacheDir(), { recursive: true });
  const target = queueFile();
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  let existing: CommunityReviewRecord[] = [];
  try {
    const parsed = JSON.parse(await readFile(target, "utf8")) as {
      records?: CommunityReviewRecord[];
    };
    existing = parsed.records ?? [];
  } catch {
    existing = [];
  }
  const bySignal = new Map(existing.map((record) => [record.signalId, record]));
  for (const record of records) {
    bySignal.set(record.signalId, {
      ...record,
      id: bySignal.get(record.signalId)?.id || record.id,
      notes: bySignal.get(record.signalId)?.notes ?? [],
    });
  }
  await writeFile(
    temporary,
    JSON.stringify({ records: [...bySignal.values()].slice(0, 500) })
  );
  await rename(temporary, target);
}

export function statusOf(
  status: DeveloperCommunityStatus
): "watch" | "review-queue" | "publish" {
  if (status === "PUBLISH") return "publish";
  if (status === "WATCH") return "watch";
  return "review-queue";
}
