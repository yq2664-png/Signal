import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import type { Insight, InsightRole, InsightStatus } from "@/lib/types";
import type { EvidenceCluster } from "@/lib/live/insights/cluster";

export type ClusterReportRow = {
  id: string;
  status: InsightStatus;
  reason: string;
  roles: InsightRole[];
  independentCount: number;
  evidenceCount: number;
  contradiction: boolean;
  freshness: string;
};

export type InsightsRunReport = {
  completedAt: string;
  windowDays: 21;
  evidenceByRole: Record<InsightRole, number>;
  evidenceCount: number;
  clusters: ClusterReportRow[];
  counts: Record<InsightStatus, number>;
  published: Insight[];
  groundingViolations: string[];
  frozenPipelinesUntouched: true;
};

export function emptyCounts(): Record<InsightStatus, number> {
  return { PUBLISH: 0, WATCH: 0, NOT_INSIGHT: 0 };
}

export async function persistInsightsReport(
  report: InsightsRunReport
): Promise<void> {
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(
    path.join(getCacheDir(), "insights-last-run.json"),
    JSON.stringify(report, null, 2)
  );
}

export function clusterRow(
  cluster: EvidenceCluster,
  row: Omit<ClusterReportRow, "id" | "evidenceCount">
): ClusterReportRow {
  return {
    id: cluster.id,
    evidenceCount: cluster.members.length,
    ...row,
  };
}
