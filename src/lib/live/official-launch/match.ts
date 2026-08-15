import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import {
  entityTokens,
  normalizeLaunchTitle,
} from "@/lib/live/official-launch/dedupe";
import {
  sanitizeDiagnosticError,
  type OfficialLaunchDiagnosticsCollector,
} from "@/lib/live/official-launch/diagnostics";
import type {
  OfficialLaunchDecisionMethod,
  QualifiedLaunchRecord,
} from "@/lib/types";

export interface LaunchCandidatePair {
  leftIndex: number;
  rightIndex: number;
  left: QualifiedLaunchRecord;
  right: QualifiedLaunchRecord;
}

export type SemanticMatchDecider = (
  left: QualifiedLaunchRecord,
  right: QualifiedLaunchRecord
) => Promise<boolean>;

const DATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const CACHE_FILE = path.join(getCacheDir(), "official-launch-matches-v1.json");

function versionsConflict(
  left: QualifiedLaunchRecord,
  right: QualifiedLaunchRecord
): boolean {
  return Boolean(
    left.entities.version &&
      right.entities.version &&
      left.entities.version.toLowerCase() !== right.entities.version.toLowerCase()
  );
}

/**
 * Entity/date blocking keeps semantic matching sub-quadratic in practice.
 * Records without a shared product/model identity do not reach the LLM.
 */
export function buildCandidatePairs(
  records: QualifiedLaunchRecord[],
  diagnostics?: OfficialLaunchDiagnosticsCollector
): LaunchCandidatePair[] {
  const blocks = new Map<string, number[]>();
  records.forEach((record, index) => {
    for (const token of entityTokens(record).filter(
      (value) => !value.includes(":")
    )) {
      const key = `${record.organizationId}:${token}`;
      blocks.set(key, [...new Set([...(blocks.get(key) ?? []), index])]);
    }
  });

  const seen = new Set<string>();
  const pairs: LaunchCandidatePair[] = [];
  for (const indices of blocks.values()) {
    for (let left = 0; left < indices.length; left += 1) {
      for (let right = left + 1; right < indices.length; right += 1) {
        const leftIndex = indices[left];
        const rightIndex = indices[right];
        if (leftIndex === rightIndex) continue;
        const key = `${leftIndex}:${rightIndex}`;
        if (seen.has(key)) continue;
        const leftRecord = records[leftIndex];
        const rightRecord = records[rightIndex];
        const dateDistance = Math.abs(
          Date.parse(leftRecord.publishedAt) - Date.parse(rightRecord.publishedAt)
        );
        if (versionsConflict(leftRecord, rightRecord)) {
          diagnostics?.record({
            candidateId: `${leftRecord.id}|${rightRecord.id}`,
            organizationId: leftRecord.organizationId,
            channelId: leftRecord.channelId,
            title: leftRecord.title,
            url: leftRecord.url,
            stage: "match",
            status: "rejected",
            method: "deterministic",
            targetId: rightRecord.id,
          });
          continue;
        }
        if (
          leftRecord.organizationId !== rightRecord.organizationId ||
          !Number.isFinite(dateDistance) ||
          dateDistance > DATE_WINDOW_MS
        ) {
          continue;
        }
        seen.add(key);
        pairs.push({
          leftIndex,
          rightIndex,
          left: leftRecord,
          right: rightRecord,
        });
      }
    }
  }
  return pairs;
}

function titleSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeLaunchTitle(left).split(" ").filter(Boolean));
  const rightTokens = new Set(
    normalizeLaunchTitle(right).split(" ").filter(Boolean)
  );
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token)
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function deterministicMatch(
  left: QualifiedLaunchRecord,
  right: QualifiedLaunchRecord
): boolean | undefined {
  if (versionsConflict(left, right)) return false;
  const sameModel =
    left.entities.model &&
    right.entities.model &&
    left.entities.model.toLowerCase() === right.entities.model.toLowerCase();
  const sameProduct =
    left.entities.product &&
    right.entities.product &&
    left.entities.product.toLowerCase() === right.entities.product.toLowerCase();
  const similarity = titleSimilarity(left.title, right.title);
  const dateDistance = Math.abs(
    Date.parse(left.publishedAt) - Date.parse(right.publishedAt)
  );
  const releaseLanguage =
    /\b(introducing|launch|release|open[- ]weights?)\b/i.test(left.title) ||
    /\b(introducing|launch|release|open[- ]weights?)\b/i.test(right.title);
  if (
    sameModel &&
    dateDistance <= 2 * 24 * 60 * 60 * 1_000 &&
    releaseLanguage
  ) {
    return true;
  }
  if (sameModel && similarity >= 0.2) return true;
  if (sameProduct && left.eventType === right.eventType && similarity >= 0.35) {
    return true;
  }
  if (similarity < 0.12) return false;
  return undefined;
}

function pairCacheKey(
  left: QualifiedLaunchRecord,
  right: QualifiedLaunchRecord
): string {
  return createHash("sha256")
    .update([left.canonicalUrl, right.canonicalUrl].sort().join("|"))
    .digest("hex")
    .slice(0, 24);
}

async function loadCache(): Promise<Record<string, boolean>> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8")) as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}

async function saveCache(cache: Record<string, boolean>): Promise<void> {
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache), "utf8");
}

async function openAiMatch(
  left: QualifiedLaunchRecord,
  right: QualifiedLaunchRecord
): Promise<boolean> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Decide whether two first-party records describe the exact same launch event. Different versions or separately shipped capabilities are different events. Return JSON only: {"sameEvent":boolean}.',
        },
        {
          role: "user",
          content: `A: ${left.title}
${left.summary}
${left.publishedAt}

B: ${right.title}
${right.summary}
${right.publishedAt}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const parsed = JSON.parse(
    data.choices?.[0]?.message?.content || "{}"
  ) as { sameEvent?: boolean };
  return parsed.sameEvent === true;
}

export async function matchCandidatePairs(
  records: QualifiedLaunchRecord[],
  decider?: SemanticMatchDecider,
  options?: {
    diagnostics?: OfficialLaunchDiagnosticsCollector;
    forceRefreshAcceptedOnly?: boolean;
    deciderMethod?: OfficialLaunchDecisionMethod;
  }
): Promise<Array<[number, number]>> {
  const pairs = buildCandidatePairs(records, options?.diagnostics);
  const cache = decider ? {} : await loadCache();
  let changed = false;
  const matches: Array<[number, number]> = [];

  for (const pair of pairs) {
    let isMatch = deterministicMatch(pair.left, pair.right);
    let method: OfficialLaunchDecisionMethod = "deterministic";
    if (isMatch === undefined) {
      if (decider) {
        method = options?.deciderMethod ?? "openai-api";
        try {
          isMatch = await decider(pair.left, pair.right);
        } catch (error) {
          method = "fallback";
          isMatch = false;
          options?.diagnostics?.record({
            candidateId: `${pair.left.id}|${pair.right.id}`,
            organizationId: pair.left.organizationId,
            channelId: pair.left.channelId,
            title: pair.left.title,
            url: pair.left.url,
            stage: "match",
            status: "failed",
            reason: "extraction-failure",
            method,
            targetId: pair.right.id,
            error: sanitizeDiagnosticError(error),
          });
        }
      } else {
        const key = pairCacheKey(pair.left, pair.right);
        if (key in cache && !(options?.forceRefreshAcceptedOnly && cache[key])) {
          isMatch = cache[key];
          method = "cache";
        } else {
          try {
            isMatch = await openAiMatch(pair.left, pair.right);
            method = "openai-api";
            cache[key] = isMatch;
            changed = true;
          } catch (error) {
            method = "fallback";
            isMatch = false;
            options?.diagnostics?.record({
              candidateId: `${pair.left.id}|${pair.right.id}`,
              organizationId: pair.left.organizationId,
              channelId: pair.left.channelId,
              title: pair.left.title,
              url: pair.left.url,
              stage: "match",
              status: "failed",
              reason: "extraction-failure",
              method,
              targetId: pair.right.id,
              error: sanitizeDiagnosticError(error),
            });
          }
        }
      }
    }
    options?.diagnostics?.record({
      candidateId: `${pair.left.id}|${pair.right.id}`,
      organizationId: pair.left.organizationId,
      channelId: pair.left.channelId,
      title: pair.left.title,
      url: pair.left.url,
      stage: "match",
      status: isMatch ? "merged" : "rejected",
      reason: isMatch ? "semantic-merge" : undefined,
      method,
      targetId: pair.right.id,
    });
    if (isMatch) matches.push([pair.leftIndex, pair.rightIndex]);
  }

  if (changed) await saveCache(cache).catch(() => undefined);
  return matches;
}
