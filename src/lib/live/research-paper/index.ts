import { fetchArxivByIds, type ArxivCanonical } from "@/lib/live/research-paper/arxiv-atom";
import {
  DEFAULT_WINDOW_DAYS,
  PUBLISH_CAP,
  RECALL_WINDOW_DAYS,
} from "@/lib/live/research-paper/config";
import { deterministicDedupe } from "@/lib/live/research-paper/dedupe";
import {
  ResearchPaperDiagnosticsCollector,
  persistResearchPaperRun,
  sanitizeDiagnosticError,
} from "@/lib/live/research-paper/diagnostics";
import { qualifyResearchPaper } from "@/lib/live/research-paper/gate";
import {
  fetchHfDailyPapers,
  fetchHfPaper,
  type HfCaptureRecord,
} from "@/lib/live/research-paper/hf";
import { isWithinWindow, normalizeTitle, stripArxivVersion } from "@/lib/live/research-paper/identity";
import {
  listPublishOverrides,
  upsertReviewRecords,
  type ReviewRecord,
} from "@/lib/live/research-paper/queue";
import { researchPaperToFeedItem } from "@/lib/live/research-paper/to-feed-item";
import {
  fetchVenueCandidates,
  type VenueFilterRecord,
} from "@/lib/live/research-paper/venue-capture";
import type { FeedItem, ResearchPaper } from "@/lib/types";

export interface ResearchPaperFetchResult<T> {
  data: T;
  errors: string[];
  diagnosticsRunId?: string;
  capture?: {
    unionCount: number;
    venueCaptured: number;
    venueFiltered: number;
    watch: number;
    reviewQueue: number;
    published: number;
  };
}

export interface ResearchPaperBuildOptions {
  now?: Date;
  windowDays?: number;
  publishCap?: number;
  canonicalById?: Map<string, ArxivCanonical>;
  diagnostics?: ResearchPaperDiagnosticsCollector;
  persistDiagnostics?: boolean;
  forcePublishIds?: Set<string>;
}

function paperUrl(captured: HfCaptureRecord, arxivId: string, doi?: string): string {
  if (captured.url) return captured.url;
  if (arxivId) return `https://arxiv.org/abs/${arxivId}`;
  if (doi) return `https://doi.org/${doi}`;
  return "";
}

function mergePaper(
  captured: HfCaptureRecord,
  canonical?: ArxivCanonical
): ResearchPaper {
  const arxivId = stripArxivVersion(canonical?.arxivId || captured.arxivId);
  const title = canonical?.title || captured.title;
  const doi = canonical?.doi || captured.doi;
  return {
    arxivId,
    doi,
    title,
    titleNorm: normalizeTitle(title),
    abstract: canonical?.abstract || captured.abstract,
    authors:
      canonical?.authors?.length ? canonical.authors : captured.authors,
    categories: canonical?.categories ?? [],
    publishedAt:
      canonical?.publishedAt ||
      captured.publishedAt ||
      captured.hfSubmittedAt ||
      new Date().toISOString(),
    hfSubmittedAt: captured.hfSubmittedAt,
    githubUrl: captured.githubUrl,
    demoUrl: captured.demoUrl,
    institution: captured.institution,
    upvotes: captured.upvotes,
    stars: captured.stars,
    url: paperUrl(captured, arxivId, doi),
    venue: captured.venue,
    venueTier: captured.venueTier,
    topic: captured.topic,
  };
}

function isForcePublish(paper: ResearchPaper, ids?: Set<string>): boolean {
  if (!ids || ids.size === 0) return false;
  if (paper.arxivId && ids.has(paper.arxivId)) return true;
  if (paper.doi && ids.has(paper.doi)) return true;
  return false;
}

function toReviewRecord(input: {
  state: ReviewRecord["state"];
  title: string;
  venue?: string;
  arxivId?: string;
  doi?: string;
  topic?: string;
  decisionRule?: string;
  rejectionReason?: string;
  evidence?: string;
}): ReviewRecord {
  return {
    id: "",
    state: input.state,
    title: input.title,
    venue: input.venue,
    arxivId: input.arxivId || undefined,
    doi: input.doi,
    topic: input.topic,
    decisionRule: input.decisionRule,
    rejectionReason: input.rejectionReason,
    evidence: input.evidence,
    timestamp: new Date().toISOString(),
    notes: [],
  };
}

function fromPaper(
  paper: ResearchPaper,
  state: ReviewRecord["state"],
  decisionRule?: string,
  rejectionReason?: string
): ReviewRecord {
  return toReviewRecord({
    state,
    title: paper.title,
    venue: paper.venue,
    arxivId: paper.arxivId,
    doi: paper.doi,
    topic: paper.topic,
    decisionRule,
    rejectionReason,
    evidence: paper.abstract.slice(0, 280),
  });
}

export function unionCaptures(
  hf: HfCaptureRecord[],
  venue: HfCaptureRecord[]
): HfCaptureRecord[] {
  const merged = [...hf, ...venue].map((record) => ({
    ...record,
    publishedAt:
      record.publishedAt || record.hfSubmittedAt || new Date().toISOString(),
  }));
  return deterministicDedupe(merged).unique;
}

export function buildResearchPapers(
  captured: HfCaptureRecord[],
  options?: ResearchPaperBuildOptions
): {
  papers: ResearchPaper[];
  items: FeedItem[];
  diagnostics: ReturnType<ResearchPaperDiagnosticsCollector["finish"]>;
  watch: ReviewRecord[];
  reviewQueue: ReviewRecord[];
} {
  const now = options?.now ?? new Date();
  const windowDays = Math.max(
    1,
    Math.min(options?.windowDays ?? DEFAULT_WINDOW_DAYS, RECALL_WINDOW_DAYS)
  );
  const publishCap = options?.publishCap ?? PUBLISH_CAP;
  const diagnostics =
    options?.diagnostics ??
    new ResearchPaperDiagnosticsCollector({
      inputCount: captured.length,
      windowDays,
      publishCap,
    });

  const inWindow: ResearchPaper[] = [];
  const watch: ReviewRecord[] = [];
  const reviewQueue: ReviewRecord[] = [];

  for (const record of captured) {
    const arxivId = stripArxivVersion(record.arxivId);
    diagnostics.record({
      candidateId: arxivId || record.doi || record.title,
      arxivId,
      title: record.title,
      stage: "capture",
      status: "captured",
      upvotes: record.upvotes,
    });

    if (!isWithinWindow(record.hfSubmittedAt, now, windowDays)) {
      diagnostics.record({
        candidateId: arxivId || record.doi || record.title,
        arxivId,
        title: record.title,
        stage: "window",
        status: "outside-window",
        reason: "outside-window",
        upvotes: record.upvotes,
      });
      continue;
    }

    const canonical = arxivId
      ? options?.canonicalById?.get(arxivId)
      : undefined;
    const paper = mergePaper(record, canonical);
    if (canonical) {
      diagnostics.record({
        candidateId: paper.arxivId,
        arxivId: paper.arxivId,
        title: paper.title,
        stage: "canonical",
        status: "canonicalized",
      });
    } else if (arxivId) {
      diagnostics.record({
        candidateId: paper.arxivId,
        arxivId: paper.arxivId,
        title: paper.title,
        stage: "canonical",
        status: "rejected",
        reason: "canonical-failure",
      });
    }
    inWindow.push(paper);
  }

  const { unique, duplicates } = deterministicDedupe(inWindow);
  for (const duplicate of duplicates) {
    diagnostics.record({
      candidateId: duplicate.dropped.arxivId,
      arxivId: duplicate.dropped.arxivId,
      title: duplicate.dropped.title,
      stage: "dedupe",
      status: "duplicate",
      reason: "duplicate",
    });
  }

  const passed: Array<{
    paper: ResearchPaper;
    cue: NonNullable<ReturnType<typeof qualifyResearchPaper>["cue"]>;
  }> = [];

  for (const paper of unique) {
    const decision = qualifyResearchPaper(paper.title, paper.abstract);
    if (decision.passCandidate) {
      diagnostics.record({
        candidateId: paper.arxivId || paper.doi || paper.titleNorm,
        arxivId: paper.arxivId,
        title: paper.title,
        stage: "gate",
        status: "pass-candidate",
        passCandidate: true,
        upvotes: paper.upvotes,
      });
    }
    const forced = isForcePublish(paper, options?.forcePublishIds);
    if (!decision.publish) {
      diagnostics.record({
        candidateId: paper.arxivId || paper.doi || paper.titleNorm,
        arxivId: paper.arxivId,
        title: paper.title,
        stage: "gate",
        status: "rejected",
        reason: decision.reason ?? "r6-else",
        passCandidate: decision.passCandidate,
        upvotes: paper.upvotes,
      });
      if (!forced) {
        if (decision.passCandidate) {
          watch.push(
            fromPaper(paper, "watch", "r4-without-r5", decision.reason)
          );
        } else {
          reviewQueue.push(
            fromPaper(
              paper,
              "review-queue",
              decision.reason ?? "r6-else",
              decision.reason ?? "r6-else"
            )
          );
        }
        continue;
      }
    }
    passed.push({
      paper,
      cue: decision.cue ?? "Agents",
    });
  }

  const ranked = [...passed].sort((left, right) => {
    const leftAt = left.paper.hfSubmittedAt || left.paper.publishedAt;
    const rightAt = right.paper.hfSubmittedAt || right.paper.publishedAt;
    return new Date(rightAt).getTime() - new Date(leftAt).getTime();
  });

  const published = ranked.slice(0, publishCap);
  const capped = ranked.slice(publishCap);

  for (const item of published) {
    diagnostics.record({
      candidateId: item.paper.arxivId || item.paper.doi || item.paper.titleNorm,
      arxivId: item.paper.arxivId,
      title: item.paper.title,
      stage: "publish",
      status: "published",
      passCandidate: true,
      upvotes: item.paper.upvotes,
    });
  }
  for (const item of capped) {
    diagnostics.record({
      candidateId: item.paper.arxivId || item.paper.doi || item.paper.titleNorm,
      arxivId: item.paper.arxivId,
      title: item.paper.title,
      stage: "publish",
      status: "capped",
      reason: "capped",
      passCandidate: true,
      upvotes: item.paper.upvotes,
    });
    watch.push(fromPaper(item.paper, "watch", "capped", "capped"));
  }

  const items = published.map(({ paper, cue }) =>
    researchPaperToFeedItem(paper, cue)
  );

  return {
    papers: published.map((item) => item.paper),
    items,
    diagnostics: diagnostics.finish(items.length),
    watch,
    reviewQueue,
  };
}

function filteredToReview(record: VenueFilterRecord): ReviewRecord {
  return toReviewRecord({
    state: "review-queue",
    title: record.title,
    venue: record.venue,
    arxivId: record.arxivId,
    doi: record.doi,
    topic: record.topic,
    decisionRule: record.reason,
    rejectionReason: record.reason,
    evidence: record.reason,
  });
}

export async function fetchResearchPaperFeedItems(options?: {
  now?: Date;
  windowDays?: number;
  publishCap?: number;
  persistDiagnostics?: boolean;
}): Promise<ResearchPaperFetchResult<FeedItem[]>> {
  const errors: string[] = [];
  const windowDays = options?.windowDays ?? DEFAULT_WINDOW_DAYS;
  const publishCap = options?.publishCap ?? PUBLISH_CAP;
  const now = options?.now ?? new Date();
  let captured: HfCaptureRecord[] = [];

  try {
    captured = await fetchHfDailyPapers({ now, windowDays });
  } catch (error) {
    errors.push(sanitizeDiagnosticError(error));
    return { data: [], errors };
  }

  let venueCaptured: HfCaptureRecord[] = [];
  let venueFiltered: VenueFilterRecord[] = [];
  try {
    const venue = await fetchVenueCandidates({ now, windowDays });
    venueCaptured = venue.captured;
    venueFiltered = venue.filtered;
    errors.push(
      ...venue.errors.map((error) =>
        error.startsWith("venue:") ? error : `venue:${error}`
      )
    );
  } catch (error) {
    errors.push(`venue:${sanitizeDiagnosticError(error)}`);
  }

  captured = unionCaptures(captured, venueCaptured);

  const diagnostics = new ResearchPaperDiagnosticsCollector({
    inputCount: captured.length,
    windowDays,
    publishCap,
  });

  const inWindowIds = captured
    .filter((record) => isWithinWindow(record.hfSubmittedAt, now, windowDays))
    .map((record) => record.arxivId)
    .filter(Boolean);

  const canonicalById = new Map<string, ArxivCanonical>();
  try {
    const canonical = await fetchArxivByIds(inWindowIds);
    for (const entry of canonical) {
      canonicalById.set(entry.arxivId, entry);
    }
  } catch (error) {
    errors.push(sanitizeDiagnosticError(error));
  }

  const forcePublishIds = new Set(await listPublishOverrides().catch(() => []));

  const built = buildResearchPapers(captured, {
    now,
    windowDays,
    publishCap,
    canonicalById,
    diagnostics,
    forcePublishIds,
  });

  const enriched: FeedItem[] = [];
  for (const item of built.items) {
    const arxivId = item.researchPaper?.arxivId;
    if (!arxivId) {
      enriched.push(item);
      continue;
    }
    try {
      const detail = await fetchHfPaper(arxivId);
      if (!detail?.githubUrl && !detail?.demoUrl && !detail?.institution) {
        enriched.push(item);
        continue;
      }
      const paper = built.papers.find((candidate) => candidate.arxivId === arxivId);
      if (!paper) {
        enriched.push(item);
        continue;
      }
      paper.githubUrl = paper.githubUrl || detail.githubUrl;
      paper.demoUrl = paper.demoUrl || detail.demoUrl;
      paper.institution = paper.institution || detail.institution;
      paper.stars = paper.stars ?? detail.stars;
      enriched.push(
        researchPaperToFeedItem(paper, item.researchPaper?.relevanceCue)
      );
    } catch (error) {
      errors.push(sanitizeDiagnosticError(error));
      enriched.push(item);
    }
  }

  if (options?.persistDiagnostics !== false) {
    await persistResearchPaperRun(built.diagnostics).catch(() => undefined);
    await upsertReviewRecords([
      ...built.watch,
      ...built.reviewQueue,
      ...venueFiltered.map(filteredToReview),
    ]).catch(() => undefined);
  }

  return {
    data: enriched,
    errors,
    diagnosticsRunId: built.diagnostics.runId,
    capture: {
      unionCount: captured.length,
      venueCaptured: venueCaptured.length,
      venueFiltered: venueFiltered.length,
      watch: built.watch.length,
      reviewQueue: built.reviewQueue.length + venueFiltered.length,
      published: enriched.length,
    },
  };
}

export { qualifyResearchPaper } from "@/lib/live/research-paper/gate";
export { fetchHfDailyPapers, fetchHfPaper } from "@/lib/live/research-paper/hf";
export { fetchArxivByIds } from "@/lib/live/research-paper/arxiv-atom";
export { listResearchPaperRuns } from "@/lib/live/research-paper/diagnostics";
export { fetchVenueCandidates } from "@/lib/live/research-paper/venue-capture";
export {
  applyReviewAction,
  listReviewQueue,
} from "@/lib/live/research-paper/queue";
export { matchTaxonomy } from "@/lib/live/research-paper/taxonomy";
export {
  TRUSTED_VENUES,
  candidateVenues,
  monitoredVenues,
} from "@/lib/live/research-paper/venues";
export { runOfflineVenueDiscovery } from "@/lib/live/research-paper/discovery";
