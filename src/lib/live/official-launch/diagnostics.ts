import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import type {
  OfficialLaunchCandidateDiagnostic,
  OfficialLaunchRunDiagnostic,
} from "@/lib/types";

const MAX_RUNS = 40;
const MAX_CANDIDATES_PER_RUN = 1_000;

function diagnosticsFile(): string {
  return path.join(getCacheDir(), "official-launch-diagnostics.json");
}

export function sanitizeDiagnosticError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/(?:sk|key|token|bearer)[-_a-z0-9]{8,}/gi, "[redacted]")
    .replace(/authorization:\s*\S+/gi, "authorization: [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

type CandidateInput = Omit<OfficialLaunchCandidateDiagnostic, "recordedAt">;

export class OfficialLaunchDiagnosticsCollector {
  readonly runId = randomUUID();
  readonly startedAt = new Date().toISOString();
  readonly mode: OfficialLaunchRunDiagnostic["mode"];
  readonly inputCount: number;
  private readonly candidates: OfficialLaunchCandidateDiagnostic[] = [];

  constructor(inputCount: number, mode?: OfficialLaunchRunDiagnostic["mode"]) {
    this.inputCount = inputCount;
    this.mode =
      mode ?? (process.env.OPENAI_API_KEY?.trim() ? "openai" : "deterministic");
  }

  record(input: CandidateInput): void {
    if (this.candidates.length >= MAX_CANDIDATES_PER_RUN) return;
    this.candidates.push({ ...input, recordedAt: new Date().toISOString() });
  }

  finish(outputCount: number): OfficialLaunchRunDiagnostic {
    return {
      runId: this.runId,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      mode: this.mode,
      inputCount: this.inputCount,
      outputCount,
      candidates: [...this.candidates],
    };
  }
}

async function readRuns(): Promise<OfficialLaunchRunDiagnostic[]> {
  try {
    const parsed = JSON.parse(await readFile(diagnosticsFile(), "utf8")) as {
      runs?: OfficialLaunchRunDiagnostic[];
    };
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}

export async function persistOfficialLaunchRun(
  run: OfficialLaunchRunDiagnostic
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

export async function listOfficialLaunchRuns(
  limit = 20
): Promise<OfficialLaunchRunDiagnostic[]> {
  return (await readRuns()).slice(0, Math.max(1, Math.min(limit, MAX_RUNS)));
}
