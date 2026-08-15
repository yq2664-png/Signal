import { writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOfficialLaunchOrganization,
} from "@/lib/live/official-launch/config";
import { fetchOfficialChannel } from "@/lib/live/official-launch/adapters";
import { OfficialLaunchDiagnosticsCollector } from "@/lib/live/official-launch/diagnostics";
import { deterministicExtract } from "@/lib/live/official-launch/extract";
import { buildOfficialLaunchEvents } from "@/lib/live/official-launch";
import { officialLaunchEventsToFeedItems } from "@/lib/live/official-launch/to-feed-item";
import type { OfficialLaunchSourceRecord } from "@/lib/types";

const live = process.env.LIVE_SMOKE === "1";

const ORG_IDS = ["prime-intellect", "moonshot", "minimax"] as const;

describe.skipIf(!live)("Batch 03 live smoke", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("fetches the three Emerging orgs and reports curation funnel", async () => {
    const summaries = [];
    for (const organizationId of ORG_IDS) {
      const organization = getOfficialLaunchOrganization(organizationId)!;
      const records: OfficialLaunchSourceRecord[] = [];
      const fetchErrors: string[] = [];
      for (const channel of organization.channels.filter(
        (candidate) => candidate.enabled !== false
      )) {
        try {
          records.push(...(await fetchOfficialChannel(organization, channel)));
        } catch (error) {
          fetchErrors.push(
            `${channel.channelId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      const listingQualified = records
        .map((record) => deterministicExtract(record, organization))
        .filter((item) => item !== null);
      const diagnostics = new OfficialLaunchDiagnosticsCollector(records.length);
      const events = await buildOfficialLaunchEvents(records, {
        persistDiagnostics: false,
        organizations: [organization],
        diagnostics,
      });
      const items = officialLaunchEventsToFeedItems(events);
      const snapshot = diagnostics.finish(events.length);
      const enrichment = snapshot.candidates.filter(
        (candidate) => candidate.stage === "enrichment"
      );
      const pipelineQualified = snapshot.candidates.filter(
        (candidate) =>
          candidate.stage === "qualification" && candidate.status === "accepted"
      );
      const belowTier = snapshot.candidates.filter(
        (candidate) => candidate.reason === "below-tier-threshold"
      );
      const dropped = listingQualified.filter(
        (record) =>
          !events.some(
            (event) =>
              event.sources.some((source) => source.url === record.url) ||
              event.title === record.title
          )
      );
      const payload = {
        organizationId,
        fetchErrors,
        records: records.length,
        byChannel: Object.fromEntries(
          organization.channels
            .filter((channel) => channel.enabled !== false)
            .map((channel) => [
              channel.channelId,
              records.filter((record) => record.channelId === channel.channelId)
                .length,
            ])
        ),
        titles: records.map((record) => ({
          channelId: record.channelId,
          title: record.title,
          publishedAt: record.publishedAt,
          url: record.url,
        })),
        listingQualified: listingQualified.map((record) => ({
          title: record.title,
          model: record.entities.model,
          product: record.entities.product,
          qualification: record.qualificationScore,
          novelty: record.noveltyScore,
          impact: record.impactScore,
          url: record.url,
        })),
        pipelineQualified: pipelineQualified.map((candidate) => ({
          title: candidate.title,
          url: candidate.url,
          scores: candidate.scores,
        })),
        published: events.map((event) => ({
          title: event.title,
          eventType: event.eventType,
          model: event.entities.model,
          product: event.entities.product,
          qualification: event.qualificationScore,
          novelty: event.noveltyScore,
          impact: event.impactScore,
          url: event.primarySource.url,
          channels: event.sources.map((source) => source.channelId),
          supporting: event.sources.length - 1,
        })),
        belowTierThreshold: belowTier.map((candidate) => ({
          title: candidate.title,
          url: candidate.url,
          scores: candidate.scores,
        })),
        enrichment: {
          triggered: enrichment.filter((candidate) => candidate.enrichmentTriggered)
            .length,
          skipped: enrichment.filter((candidate) => candidate.enrichmentSkipped)
            .length,
          cacheHits: enrichment.filter((candidate) => candidate.enrichmentCacheHit)
            .length,
          fetchSuccess: enrichment.filter(
            (candidate) => candidate.enrichmentFetchSuccess
          ).length,
          fetchFailure: enrichment.filter(
            (candidate) => candidate.enrichmentFetchFailure
          ).length,
        },
        dropped: dropped.map((record) => ({
          title: record.title,
          qualification: record.qualificationScore,
          novelty: record.noveltyScore,
          impact: record.impactScore,
          confidence: record.confidence,
          url: record.url,
          wouldCorePublish:
            record.qualificationScore >= 72 &&
            record.noveltyScore >= 50 &&
            record.impactScore >= 55,
        })),
        cards: items.length,
        fetched: records.length,
        qualifiedListing: listingQualified.length,
        qualifiedPipeline: pipelineQualified.length,
        publishedCount: events.length,
      };
      summaries.push(payload);
    }
    writeFileSync(
      "/tmp/batch-03-live-smoke.json",
      JSON.stringify(summaries, null, 2)
    );
    expect(summaries).toHaveLength(3);
    for (const summary of summaries) {
      expect(summary.fetchErrors, JSON.stringify(summary.fetchErrors)).toEqual(
        []
      );
      expect(summary.records).toBeGreaterThan(0);
      expect(summary.cards).toBe(summary.published.length);
    }
  }, 180_000);
});
