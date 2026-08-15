import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import type {
  ResearchPaperCandidateDiagnostic,
  ResearchPaperDiagnosticReason,
  ResearchPaperDiagnosticStatus,
  ResearchPaperRunDiagnostic,
} from "@/lib/types";

const MAX_RUNS = 40;
const MAX_CANDIDATES_PER_RUN = 1_000;

function diagnosticsFile(): string {
  return path.join(getCacheDir(), "research-paper-diagnostics.json");
}

export function sanitizeDiagnosticError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/(?:sk|key|token|bearer)[-_a-z0-9]{8,}/gi, "[redacted]")
    .replace(/authorization:\s*\S+/gi, "authorization: [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

type CandidateInput = Omit<ResearchPaperCandidateDiagnostic, "recordedAt">;

export class ResearchPaperDiagnosticsCollector {
  readonly runId = randomUUID();
  readonly startedAt = new Date().toISOString();
  readonly windowDays: number;
  readonly publishCap: number;
  readonly inputCount: number;
  private readonly candidates: ResearchPaperCandidateDiagnostic[] = [];

  constructor(input: {
    inputCount: number;
    windowDays: number;
    publishCap: number;
  }) {
    this.inputCount = input.inputCount;
    this.windowDays = input.windowDays;
    this.publishCap = input.publishCap;
  }

  record(input: CandidateInput): void {
    if (this.candidates.length >= MAX_CANDIDATES_PER_RUN) return;
    this.candidates.push({ ...input, recordedAt: new Date().toISOString() });
  }

  finish(outputCount: number): ResearchPaperRunDiagnostic {
    const counts = {
      captured: 0,
      outsideWindow: 0,
      canonicalized: 0,
      duplicate: 0,
      rejectedR1: 0,
      rejectedR2: 0,
      rejectedR3: 0,
      rejectedR6: 0,
      passCandidate: 0,
      published: 0,
      capped: 0,
    };
    for (const candidate of this.candidates) {
      if (candidate.status === "captured") counts.captured += 1;
      if (candidate.status === "outside-window") counts.outsideWindow += 1;
      if (candidate.status === "canonicalized") counts.canonicalized += 1;
      if (candidate.status === "duplicate") counts.duplicate += 1;
      if (candidate.status === "pass-candidate") counts.passCandidate += 1;
      if (candidate.status === "published") counts.published += 1;
      if (candidate.status === "capped") counts.capped += 1;
      if (candidate.status === "rejected") {
        if (candidate.reason === "r1-theory") counts.rejectedR1 += 1;
        if (candidate.reason === "r2-infra") counts.rejectedR2 += 1;
        if (candidate.reason === "r3-incremental") counts.rejectedR3 += 1;
        if (candidate.reason === "r6-else") counts.rejectedR6 += 1;
      }
    }

    return {
      runId: this.runId,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      inputCount: this.inputCount,
      outputCount,
      windowDays: this.windowDays,
      publishCap: this.publishCap,
      counts,
      candidates: [...this.candidates],
    };
  }
}

async function readRuns(): Promise<ResearchPaperRunDiagnostic[]> {
  try {
    const parsed = JSON.parse(await readFile(diagnosticsFile(), "utf8")) as {
      runs?: ResearchPaperRunDiagnostic[];
    };
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}

export async function persistResearchPaperRun(
  run: ResearchPaperRunDiagnostic
): Promise<void> {
  const runs = [run, ...(await readRuns()).filter((item) => item.runId !== run.runId)]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, MAX_RUNS);
  await mkdir(getCacheDir(), { recursive: true });
  const file = diagnosticsFile();
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ runs }), "utf8");
  await rename(temporary, file);
}

export async function listResearchPaperRuns(
  limit = 20
): Promise<ResearchPaperRunDiagnostic[]> {
  return (await readRuns()).slice(0, Math.max(1, Math.min(limit, MAX_RUNS)));
}

export function reasonStatus(
  reason: ResearchPaperDiagnosticReason
): ResearchPaperDiagnosticStatus {
  if (reason === "outside-window") return "outside-window";
  if (reason === "duplicate") return "duplicate";
  if (reason === "capped") return "capped";
  return "rejected";
}
