import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import type { CommunitySignal } from "@/lib/types";
import type { IssueCaptureResult } from "@/lib/live/developer-community/github";
import type { HnCaptureResult } from "@/lib/live/developer-community/hn";

export type DeveloperCommunityRunReport = {
  runId: string;
  completedAt: string;
  hn: { captured: number; rejected: number; errors: string[] };
  github: {
    captured: number;
    rejected: number;
    errors: string[];
    perRepo: Record<string, number>;
  };
  uniqueAuthors: number;
  grouped: number;
  signals: {
    publish: number;
    watch: number;
    reviewQueue: number;
  };
  cards: number;
  published: Array<{
    title: string;
    signalType: string;
    products: string[];
    evidence: number;
  }>;
  reasons: Record<string, number>;
  errors: string[];
};

export function buildRunReport(input: {
  hn: HnCaptureResult;
  github: IssueCaptureResult;
  signals: CommunitySignal[];
  cards: number;
}): DeveloperCommunityRunReport {
  const perRepo: Record<string, number> = {};
  for (const item of input.github.captured) {
    const repo = item.repository || "unknown";
    perRepo[repo] = (perRepo[repo] ?? 0) + 1;
  }
  const reasons: Record<string, number> = {};
  const reasonRows = [
    ...input.hn.rejected.map((item) => item.reason),
    ...input.github.rejected.map((item) => item.reason),
    ...input.signals.map((item) => item.reason),
  ].filter((row): row is string => Boolean(row));
  for (const row of reasonRows) {
    reasons[row] = (reasons[row] ?? 0) + 1;
  }
  const authors = new Set(
    [...input.hn.captured, ...input.github.captured].map((item) => item.authorId)
  );
  return {
    runId: randomUUID(),
    completedAt: new Date().toISOString(),
    hn: {
      captured: input.hn.captured.length,
      rejected: input.hn.rejected.length,
      errors: input.hn.errors,
    },
    github: {
      captured: input.github.captured.length,
      rejected: input.github.rejected.length,
      errors: input.github.errors,
      perRepo,
    },
    uniqueAuthors: authors.size,
    grouped: input.signals.length,
    signals: {
      publish: input.signals.filter((item) => item.status === "PUBLISH").length,
      watch: input.signals.filter((item) => item.status === "WATCH").length,
      reviewQueue: input.signals.filter((item) => item.status === "REVIEW_QUEUE")
        .length,
    },
    cards: input.cards,
    published: input.signals
      .filter((item) => item.status === "PUBLISH")
      .map((item) => ({
        title: item.summary,
        signalType: item.signalType,
        products: item.products,
        evidence: item.evidence.length,
      })),
    reasons,
    errors: [...input.hn.errors, ...input.github.errors],
  };
}

export async function persistRunReport(
  report: DeveloperCommunityRunReport
): Promise<void> {
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(
    path.join(getCacheDir(), "developer-community-last-run.json"),
    JSON.stringify(report, null, 2)
  );
}
