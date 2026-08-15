import { fetchOfficialChannel } from "@/lib/live/official-launch/adapters";
import { clusterLaunchRecords } from "@/lib/live/official-launch/cluster";
import {
  OFFICIAL_LAUNCH_ORGANIZATIONS,
  type OfficialLaunchOrganizationConfig,
} from "@/lib/live/official-launch/config";
import { deterministicDedupe } from "@/lib/live/official-launch/dedupe";
import {
  OfficialLaunchDiagnosticsCollector,
  persistOfficialLaunchRun,
  sanitizeDiagnosticError,
} from "@/lib/live/official-launch/diagnostics";
import {
  enrichLaunchRecords,
  type EnrichmentFetchHtml,
} from "@/lib/live/official-launch/enrich";
import { qualifyLaunchRecords } from "@/lib/live/official-launch/extract";
import {
  matchCandidatePairs,
  type SemanticMatchDecider,
} from "@/lib/live/official-launch/match";
import { selectPublishableEvents } from "@/lib/live/official-launch/score";
import { officialLaunchEventsToFeedItems } from "@/lib/live/official-launch/to-feed-item";
import type {
  FeedItem,
  OfficialLaunchEvent,
  OfficialLaunchSourceRecord,
  QualifiedLaunchRecord,
} from "@/lib/types";

export interface OfficialLaunchFetchResult<T> {
  data: T;
  errors: string[];
  diagnosticsRunId?: string;
}

export interface OfficialLaunchBuildOptions {
  organizations?: OfficialLaunchOrganizationConfig[];
  semanticDecider?: SemanticMatchDecider;
  diagnostics?: OfficialLaunchDiagnosticsCollector;
  persistDiagnostics?: boolean;
  forceQualificationRefresh?: boolean;
  forceAcceptedMatchRefresh?: boolean;
  qualificationMode?: "auto" | "deterministic";
  enrichmentFetch?: EnrichmentFetchHtml;
  forceEnrichmentRefresh?: boolean;
}

export async function buildOfficialLaunchEvents(
  sourceRecords: OfficialLaunchSourceRecord[],
  options?: OfficialLaunchBuildOptions
): Promise<OfficialLaunchEvent[]> {
  const organizations =
    options?.organizations ?? OFFICIAL_LAUNCH_ORGANIZATIONS;
  const diagnostics =
    options?.diagnostics ??
    new OfficialLaunchDiagnosticsCollector(sourceRecords.length);
  const deduped = deterministicDedupe(sourceRecords, diagnostics);
  const enriched = await enrichLaunchRecords(deduped, organizations, {
    diagnostics,
    fetchHtml: options?.enrichmentFetch,
    forceRefresh: options?.forceEnrichmentRefresh,
  });
  const qualified: QualifiedLaunchRecord[] = [];

  for (const organization of organizations) {
    const records = enriched.filter(
      (record) => record.organizationId === organization.organizationId
    );
    qualified.push(
      ...(await qualifyLaunchRecords(records, organization, {
        diagnostics,
        forceRefresh: options?.forceQualificationRefresh,
        mode: options?.qualificationMode,
      }))
    );
  }

  const matches = await matchCandidatePairs(
    qualified,
    options?.semanticDecider,
    {
      diagnostics,
      forceRefreshAcceptedOnly: options?.forceAcceptedMatchRefresh,
    }
  );
  const events = clusterLaunchRecords(
    qualified,
    matches,
    organizations,
    diagnostics
  );
  const published = selectPublishableEvents(events, organizations, diagnostics);
  if (options?.persistDiagnostics !== false) {
    await persistOfficialLaunchRun(diagnostics.finish(published.length)).catch(
      (error) =>
        console.error(
          "[official-launch] failed to persist diagnostics",
          sanitizeDiagnosticError(error)
        )
    );
  }
  return published;
}

export async function fetchOfficialLaunchEvents(): Promise<
  OfficialLaunchFetchResult<OfficialLaunchEvent[]>
> {
  const requests = OFFICIAL_LAUNCH_ORGANIZATIONS.flatMap((organization) =>
    organization.channels
      .filter((channel) => channel.enabled !== false)
      .map((channel) => ({ organization, channel }))
  );
  const settled = await Promise.allSettled(
    requests.map(({ organization, channel }) =>
      fetchOfficialChannel(organization, channel)
    )
  );
  const records: OfficialLaunchSourceRecord[] = [];
  const errors: string[] = [];
  const failures: Array<{
    organization: OfficialLaunchOrganizationConfig;
    channelId: string;
    error: unknown;
  }> = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      records.push(...result.value);
      return;
    }
    const request = requests[index];
    const error = sanitizeDiagnosticError(result.reason);
    errors.push(`${request.organization.displayName}/${request.channel.channelId}: ${error}`);
    failures.push({
      organization: request.organization,
      channelId: request.channel.channelId,
      error: result.reason,
    });
  });

  const diagnostics = new OfficialLaunchDiagnosticsCollector(records.length);
  failures.forEach((failure) =>
    diagnostics.record({
      candidateId: failure.channelId,
      organizationId: failure.organization.organizationId,
      channelId: failure.channelId,
      stage: "fetch",
      status: "failed",
      reason: "fetch-failure",
      error: sanitizeDiagnosticError(failure.error),
    })
  );
  return {
    data: await buildOfficialLaunchEvents(records, { diagnostics }),
    errors,
    diagnosticsRunId: diagnostics.runId,
  };
}

export async function fetchOfficialLaunchFeedItems(): Promise<
  OfficialLaunchFetchResult<FeedItem[]>
> {
  const result = await fetchOfficialLaunchEvents();
  return {
    data: officialLaunchEventsToFeedItems(result.data),
    errors: result.errors,
    diagnosticsRunId: result.diagnosticsRunId,
  };
}
