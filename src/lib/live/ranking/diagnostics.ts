import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import { ATTENTION_WINDOW } from "@/lib/live/ranking/config";
import type { RankedFeed } from "@/lib/live/ranking/rank";

export type UnifiedRankingReport = {
  completedAt: string;
  total: number;
  window: number;
  roles: Record<string, number>;
  classes: Record<string, number>;
  windowItems: Array<{
    id: string;
    title: string;
    role: string;
    attentionClass: string;
    businessTier?: string;
    label: string;
    reason: string;
    organization: string;
    topic: string;
    diversityRules: string[];
    preferenceShift?: number;
  }>;
  violations: string[];
};

export function buildRankingReport(
  ranked: RankedFeed,
  window = ATTENTION_WINDOW
): UnifiedRankingReport {
  const annotations = ranked.annotations.slice(0, window);
  const roles: Record<string, number> = {};
  const classes: Record<string, number> = {};
  const violations: string[] = [];
  for (const row of annotations) {
    if (row.role === "BACKGROUND" && row.attentionClass !== "BACKGROUND") {
      violations.push(`${row.id}: background connector promoted`);
    }
    roles[row.role] = (roles[row.role] ?? 0) + 1;
    classes[row.attentionClass] = (classes[row.attentionClass] ?? 0) + 1;
  }
  for (let index = 1; index < annotations.length; index += 1) {
    if (annotations[index].organization === annotations[index - 1].organization) {
      violations.push(
        `org-adjacency: ${annotations[index - 1].id} → ${annotations[index].id}`
      );
    }
  }
  let streak = 1;
  for (let index = 1; index < annotations.length; index += 1) {
    if (annotations[index].role === annotations[index - 1].role) streak += 1;
    else streak = 1;
    if (streak > 2 && !annotations[index].breaking) {
      violations.push(
        `consecutive-role: ${annotations[index].role} x${streak} at ${annotations[index].id}`
      );
    }
  }
  return {
    completedAt: new Date().toISOString(),
    total: ranked.items.length,
    window,
    roles,
    classes,
    windowItems: annotations.map((row, index) => ({
      id: row.id,
      title: ranked.items[index]?.title ?? row.id,
      role: row.role,
      attentionClass: row.attentionClass,
      businessTier: row.businessTier,
      label: row.label,
      reason: row.reason,
      organization: row.organization,
      topic: row.topic,
      diversityRules: row.diversityRules,
      preferenceShift: row.preferenceShift,
    })),
    violations,
  };
}

export async function persistRankingReport(
  report: UnifiedRankingReport
): Promise<void> {
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(
    path.join(getCacheDir(), "unified-ranking-last-run.json"),
    JSON.stringify(report, null, 2)
  );
}
