import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";

export type ReviewState = "watch" | "review-queue";

export type ReviewAction =
  | "confirm-rejection"
  | "move-to-watch"
  | "approve-publish"
  | "mark-error"
  | "add-note";

export type ReviewRecord = {
  id: string;
  state: ReviewState;
  title: string;
  venue?: string;
  arxivId?: string;
  doi?: string;
  topic?: string;
  decisionRule?: string;
  rejectionReason?: string;
  evidence?: string;
  timestamp: string;
  override?: "publish" | "watch" | "reject";
  classificationError?: boolean;
  notes: string[];
  confirmed?: boolean;
};

type QueueFile = { records: ReviewRecord[] };

const MAX_RECORDS = 500;

function queueFile(): string {
  return path.join(getCacheDir(), "research-paper-queue.json");
}

async function readQueue(): Promise<QueueFile> {
  try {
    const parsed = JSON.parse(await readFile(queueFile(), "utf8")) as QueueFile;
    return { records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return { records: [] };
  }
}

async function writeQueue(file: QueueFile): Promise<void> {
  await mkdir(getCacheDir(), { recursive: true });
  const target = queueFile();
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(file), "utf8");
  await rename(temporary, target);
}

export function reviewIdentity(record: Pick<ReviewRecord, "arxivId" | "doi" | "title">): string {
  if (record.arxivId) return `arxiv:${record.arxivId}`;
  if (record.doi) return `doi:${record.doi.toLowerCase()}`;
  return `title:${record.title.toLowerCase()}`;
}

export async function listReviewQueue(state?: ReviewState): Promise<ReviewRecord[]> {
  const { records } = await readQueue();
  return state ? records.filter((record) => record.state === state) : records;
}

export async function listPublishOverrides(): Promise<string[]> {
  const { records } = await readQueue();
  return records
    .filter((record) => record.override === "publish")
    .map((record) => record.arxivId || record.doi || "")
    .filter(Boolean);
}

export async function upsertReviewRecords(incoming: ReviewRecord[]): Promise<void> {
  const file = await readQueue();
  const byId = new Map(file.records.map((record) => [reviewIdentity(record), record]));
  for (const record of incoming) {
    const key = reviewIdentity(record);
    const existing = byId.get(key);
    if (existing?.confirmed || existing?.override === "publish") {
      continue;
    }
    byId.set(key, {
      ...record,
      id: existing?.id || record.id || randomUUID(),
      notes: existing?.notes?.length ? existing.notes : record.notes,
      override: existing?.override,
      classificationError: existing?.classificationError,
      confirmed: existing?.confirmed,
    });
  }
  const records = [...byId.values()]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_RECORDS);
  await writeQueue({ records });
}

export async function applyReviewAction(input: {
  id: string;
  action: ReviewAction;
  note?: string;
}): Promise<ReviewRecord | undefined> {
  const file = await readQueue();
  const record = file.records.find((item) => item.id === input.id);
  if (!record) return undefined;
  if (input.note) record.notes.push(input.note);
  if (input.action === "confirm-rejection") {
    record.confirmed = true;
    record.state = "review-queue";
    record.override = "reject";
  }
  if (input.action === "move-to-watch") {
    record.state = "watch";
    record.override = "watch";
  }
  if (input.action === "approve-publish") {
    record.override = "publish";
  }
  if (input.action === "mark-error") {
    record.classificationError = true;
  }
  await writeQueue(file);
  return record;
}
