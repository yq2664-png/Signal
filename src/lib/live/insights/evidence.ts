import { listResearchPaperRuns } from "@/lib/live/research-paper/diagnostics";
import { CURRENT_DAYS, EVIDENCE_WINDOW_DAYS } from "@/lib/live/insights/config";
import {
  capabilityKeysFor,
  organizationKeyOf,
  productFamilyOf,
} from "@/lib/live/insights/lexicon";
import type {
  CommunitySignal,
  FeedItem,
  InsightCapabilityKey,
  InsightRole,
} from "@/lib/types";

export type QualifiedEvidence = {
  objectId: string;
  role: InsightRole;
  organization: string;
  organizationKey: string;
  productFamily: string;
  title: string;
  source: string;
  url?: string;
  timestamp: string;
  capabilityKeys: InsightCapabilityKey[];
  hiddenByCap?: boolean;
  signalType?: string;
  text: string;
};

export type EvidenceInput = {
  feedItems: FeedItem[];
  communitySignals?: CommunitySignal[];
  cappedPassPapers?: QualifiedEvidence[];
  now?: Date;
};

export function daysAgo(timestamp: string, now: Date): number {
  return (now.getTime() - new Date(timestamp).getTime()) / (24 * 60 * 60 * 1000);
}

export function inEvidenceWindow(timestamp: string, now: Date): boolean {
  const age = daysAgo(timestamp, now);
  return Number.isFinite(age) && age >= 0 && age <= EVIDENCE_WINDOW_DAYS;
}

export function isCurrent(timestamp: string, now: Date): boolean {
  const age = daysAgo(timestamp, now);
  return Number.isFinite(age) && age >= 0 && age <= CURRENT_DAYS;
}

function haystackOf(item: FeedItem): string {
  if (item.officialLaunch) {
    return [item.title, item.officialLaunch.product, item.officialLaunch.model]
      .filter(Boolean)
      .join(" ");
  }
  if (item.researchPaper) {
    return [item.title, item.summary, item.researchPaper.relevanceCue]
      .filter(Boolean)
      .join(" ");
  }
  return [item.title, item.native?.subtitle, ...(item.tags ?? [])]
    .filter(Boolean)
    .join(" ");
}

export function isEligibleCommunitySignal(signal: CommunitySignal): boolean {
  if (signal.status === "PUBLISH") return true;
  return signal.status === "WATCH" && signal.reason === "capped";
}

function fromOfficialLaunch(item: FeedItem): QualifiedEvidence | null {
  if (!item.officialLaunch && !(item.tags ?? []).includes("official-launch")) {
    return null;
  }
  const organization = item.source;
  const organizationId = (item.tags ?? []).find(
    (tag) =>
      ![
        "live",
        "official-launch",
        "core",
        "emerging",
        "ecosystem",
        "model-release",
        "product-launch",
        "api-release",
        "open-source-release",
        "major-update",
      ].includes(tag)
  );
  const organizationKey = organizationKeyOf({
    organizationId,
    source: organization,
  });
  const text = haystackOf(item);
  return {
    objectId: item.id,
    role: "SUPPLY",
    organization,
    organizationKey,
    productFamily: organizationKey,
    title: item.title,
    source: organization,
    url: item.url,
    timestamp: item.publishedAt,
    capabilityKeys: capabilityKeysFor(text),
    text,
  };
}

function fromResearchPaper(
  item: FeedItem,
  hiddenByCap = false
): QualifiedEvidence | null {
  if (!item.researchPaper && !(item.tags ?? []).includes("research-paper")) {
    return null;
  }
  const organization =
    item.native?.authorName?.split(",")[0]?.trim() ||
    item.researchPaper?.arxivId ||
    item.source;
  const organizationKey = organizationKeyOf({
    organizationId: item.researchPaper?.arxivId,
    organization,
  });
  const text = haystackOf(item);
  return {
    objectId: item.id,
    role: "CAPABILITY",
    organization,
    organizationKey,
    productFamily: organizationKey,
    title: item.title,
    source: item.source,
    url: item.url,
    timestamp: item.publishedAt,
    capabilityKeys: capabilityKeysFor(text),
    hiddenByCap,
    text,
  };
}

function fromCommunitySignal(signal: CommunitySignal): QualifiedEvidence {
  const organization = signal.products[0] || "community";
  const organizationKey = organizationKeyOf({ organization });
  const text = [signal.summary, signal.topic, signal.signalType, ...signal.products].join(
    " "
  );
  return {
    objectId: signal.signalId,
    role: "ADOPTION",
    organization,
    organizationKey,
    productFamily: productFamilyOf({
      role: "ADOPTION",
      products: signal.products,
      title: signal.summary,
      organizationKey,
    }),
    title: signal.summary,
    source: "Developer Community",
    url: signal.evidence[0]?.sourceUrl,
    timestamp: signal.lastSeenAt,
    capabilityKeys: capabilityKeysFor(`${signal.topic} ${text}`),
    hiddenByCap: signal.reason === "capped",
    signalType: signal.signalType,
    text,
  };
}

function fromDeveloperCommunityItem(item: FeedItem): QualifiedEvidence | null {
  if (
    item.source !== "Developer Community" &&
    !(item.tags ?? []).includes("developer-community")
  ) {
    return null;
  }
  const products = (item.native?.authorName ?? "")
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean);
  const organization = products[0] || "community";
  const organizationKey = organizationKeyOf({ organization });
  const text = haystackOf(item);
  return {
    objectId: item.id,
    role: "ADOPTION",
    organization,
    organizationKey,
    productFamily: productFamilyOf({
      role: "ADOPTION",
      products,
      title: item.title,
      organizationKey,
    }),
    title: item.title,
    source: item.source,
    url: item.url,
    timestamp: item.publishedAt,
    capabilityKeys: capabilityKeysFor(text),
    text,
  };
}

export function collectQualifiedEvidence(input: EvidenceInput): QualifiedEvidence[] {
  const now = input.now ?? new Date();
  const collected: QualifiedEvidence[] = [];

  for (const item of input.feedItems) {
    const supply = fromOfficialLaunch(item);
    if (supply) collected.push(supply);
    const capability = fromResearchPaper(item);
    if (capability) collected.push(capability);
  }

  if (input.communitySignals) {
    for (const signal of input.communitySignals) {
      if (!isEligibleCommunitySignal(signal)) continue;
      collected.push(fromCommunitySignal(signal));
    }
  } else {
    for (const item of input.feedItems) {
      const adoption = fromDeveloperCommunityItem(item);
      if (adoption) collected.push(adoption);
    }
  }

  if (input.cappedPassPapers) {
    collected.push(...input.cappedPassPapers);
  }

  const byId = new Map<string, QualifiedEvidence>();
  for (const row of collected) {
    if (!inEvidenceWindow(row.timestamp, now)) continue;
    if (!row.objectId || !row.title || !row.timestamp) continue;
    byId.set(row.objectId, row);
  }
  return [...byId.values()];
}

export async function loadCappedPassPapers(
  now = new Date()
): Promise<QualifiedEvidence[]> {
  try {
    const runs = await listResearchPaperRuns(1);
    const run = runs[0];
    if (!run) return [];
    return run.candidates
      .filter((candidate) => candidate.status === "capped" && candidate.title)
      .map((candidate) => {
        const title = candidate.title ?? "";
        const objectId = candidate.arxivId
          ? `arxiv-${candidate.arxivId}`
          : `paper-${candidate.candidateId}`;
        const organization = candidate.arxivId || candidate.candidateId;
        const organizationKey = organizationKeyOf({ organizationId: organization });
        return {
          objectId,
          role: "CAPABILITY" as const,
          organization,
          organizationKey,
          productFamily: organizationKey,
          title,
          source: "arXiv",
          url: candidate.arxivId
            ? `https://arxiv.org/abs/${candidate.arxivId}`
            : undefined,
          timestamp: candidate.recordedAt || run.completedAt,
          capabilityKeys: capabilityKeysFor(title),
          hiddenByCap: true,
          text: title,
        };
      })
      .filter((row) => inEvidenceWindow(row.timestamp, now));
  } catch {
    return [];
  }
}
