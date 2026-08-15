import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "@/lib/live/official-launch/official-launch.fixtures.json";
import type {
  OfficialLaunchDiagnosticReason,
  OfficialLaunchSourceRecord,
  QualifiedLaunchRecord,
} from "@/lib/types";
import {
  OFFICIAL_LAUNCH_ORGANIZATIONS,
  getOfficialLaunchOrganization,
} from "@/lib/live/official-launch/config";
import {
  canonicalizeUrl,
  identityUrl,
  deterministicDedupe,
} from "@/lib/live/official-launch/dedupe";
import {
  deterministicExtract,
  hasExplicitLaunchEvidence,
  qualifyLaunchRecords,
} from "@/lib/live/official-launch/extract";
import {
  buildCandidatePairs,
  matchCandidatePairs,
} from "@/lib/live/official-launch/match";
import {
  buildOfficialLaunchEvents,
} from "@/lib/live/official-launch";
import { officialLaunchEventsToFeedItems } from "@/lib/live/official-launch/to-feed-item";
import { parseMarkdownReleaseNotes } from "@/lib/live/official-launch/adapters";
import {
  OfficialLaunchDiagnosticsCollector,
  listOfficialLaunchRuns,
  persistOfficialLaunchRun,
} from "@/lib/live/official-launch/diagnostics";

const openAi = getOfficialLaunchOrganization("openai")!;
const anthropic = getOfficialLaunchOrganization("anthropic")!;
const thinkingMachines = getOfficialLaunchOrganization("thinking-machines")!;

function sourceRecord(
  overrides: Partial<OfficialLaunchSourceRecord> = {}
): OfficialLaunchSourceRecord {
  return {
    id: "record-1",
    organizationId: "openai",
    channelId: "openai-news",
    sourceType: "newsroom",
    authority: 90,
    role: "primary",
    title: "Introducing GPT-5.1",
    summary: "A new reasoning model available today.",
    originalContent: "A new reasoning model available today.",
    url: "https://openai.com/index/gpt-5-1",
    canonicalUrl: "https://openai.com/index/gpt-5-1",
    publishedAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function fixtureRecords(
  records: Array<Omit<OfficialLaunchSourceRecord, "originalContent">>
): OfficialLaunchSourceRecord[] {
  return records.map((record) => ({
    ...record,
    originalContent: record.summary,
  }));
}

describe("official launch qualification and dedupe", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("canonicalizes tracking URLs and dedupes source, URL, then title", () => {
    expect(
      canonicalizeUrl(
        "https://www.openai.com/index/gpt-5-1/?utm_source=x&ref=home#models"
      )
    ).toBe("https://openai.com/index/gpt-5-1");
    expect(
      identityUrl("https://api-docs.deepseek.com/updates#deepseek-v4-pro-update")
    ).toBe("https://api-docs.deepseek.com/updates#deepseek-v4-pro-update");

    const duplicateUrl = sourceRecord({
      id: "record-2",
      url: "https://openai.com/index/gpt-5-1?utm_medium=social",
      canonicalUrl: "https://openai.com/index/gpt-5-1?utm_medium=social",
      authority: 78,
    });
    const duplicateTitle = sourceRecord({
      id: "record-3",
      channelId: "openai-x",
      title: "Announcing GPT-5.1",
      url: "https://x.com/OpenAI/status/1",
      canonicalUrl: "https://x.com/OpenAI/status/1",
      authority: 65,
    });

    expect(
      deterministicDedupe([duplicateUrl, duplicateTitle, sourceRecord()])
    ).toHaveLength(1);
  });

  it("extracts a strong launch and rejects hiring, events, and minor fixes", () => {
    const launch = deterministicExtract(sourceRecord(), openAi);
    expect(launch).toMatchObject({
      eventType: "model-release",
      entities: { company: "OpenAI", model: "GPT-5.1", version: "5.1" },
      qualificationMethod: "deterministic",
    });

    for (const excluded of fixtures.excluded) {
      expect(
        deterministicExtract(
          sourceRecord({
            title: excluded.title,
            summary: excluded.summary,
          }),
          excluded.title.includes("Anthropic") ? anthropic : openAi
        )
      ).toBeNull();
    }
  });

  it("gates semantic candidates by company, entity, date, and version", () => {
    const records = fixtureRecords(
      fixtures.openAiCrossChannel as Array<
        Omit<OfficialLaunchSourceRecord, "originalContent">
      >
    ).map((record) =>
      deterministicExtract(record, openAi)
    ) as QualifiedLaunchRecord[];
    const unrelated = deterministicExtract(
      sourceRecord({
        id: "anthropic-1",
        organizationId: "anthropic",
        channelId: "anthropic-news",
        title: "Introducing Claude Sonnet 5",
        summary: "Claude Sonnet 5 is a new model available today.",
        url: "https://anthropic.com/news/claude-sonnet-5",
        canonicalUrl: "https://anthropic.com/news/claude-sonnet-5",
      }),
      anthropic
    )!;
    expect(buildCandidatePairs([...records, unrelated])).toHaveLength(3);

    const versions = fixtureRecords(
      fixtures.distinctVersions as Array<
        Omit<OfficialLaunchSourceRecord, "originalContent">
      >
    ).map((record) =>
      deterministicExtract(record, openAi)
    ) as QualifiedLaunchRecord[];
    expect(buildCandidatePairs(versions)).toHaveLength(0);
  });
});

describe("official launch clustering and publication", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("clusters Blog, Developer, and X records and selects authority primary", async () => {
    const events = await buildOfficialLaunchEvents(
      fixtureRecords(
        fixtures.openAiCrossChannel as Array<
          Omit<OfficialLaunchSourceRecord, "originalContent">
        >
      )
    );

    expect(events).toHaveLength(1);
    expect(events[0].sources).toHaveLength(3);
    expect(events[0].primarySource.channelId).toBe("openai-news");
    expect(events[0].entities.version).toBe("5.1");
  });

  it("keeps distinct release versions separate", async () => {
    const events = await buildOfficialLaunchEvents(
      fixtureRecords(
        fixtures.distinctVersions as Array<
          Omit<OfficialLaunchSourceRecord, "originalContent">
        >
      )
    );
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.entities.version).sort()).toEqual([
      "5.1",
      "5.2",
    ]);
  });

  it("applies the stricter Emerging novelty and impact threshold", async () => {
    const lowNovelty = sourceRecord({
      id: "thinking-1",
      organizationId: "thinking-machines",
      channelId: "thinking-machines-news",
      sourceType: "launch-page",
      authority: 100,
      title: "Announcing Tinker platform for teams",
      summary: "Thinking Machines is launching Tinker for teams.",
      url: "https://thinkingmachines.ai/news/tinker-teams",
      canonicalUrl: "https://thinkingmachines.ai/news/tinker-teams",
    });
    const events = await buildOfficialLaunchEvents([lowNovelty], {
      organizations: OFFICIAL_LAUNCH_ORGANIZATIONS,
    });
    expect(deterministicExtract(lowNovelty, thinkingMachines)).not.toBeNull();
    expect(events).toEqual([]);
  });

  it("maps one clustered Event to one card with supporting sources", async () => {
    const events = await buildOfficialLaunchEvents(
      fixtureRecords(
        fixtures.openAiCrossChannel as Array<
          Omit<OfficialLaunchSourceRecord, "originalContent">
        >
      )
    );
    const items = officialLaunchEventsToFeedItems(events);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "OpenAI",
      officialLaunch: {
        eventId: events[0].eventId,
        eventType: "model-release",
      },
    });
    expect(items[0].officialLaunch?.supportingSources).toHaveLength(2);
  });
});

describe("official release-note adapters", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses OpenAI month context with nested day headings", () => {
    const channel = openAi.channels.find(
      (candidate) => candidate.channelId === "openai-developer"
    )!;
    const records = parseMarkdownReleaseNotes(
      fixtures.openAiMarkdown,
      openAi,
      channel
    );

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.publishedAt)).toEqual([
      "2026-08-07T12:00:00.000Z",
      "2026-08-06T12:00:00.000Z",
    ]);
    expect(records[0]).toMatchObject({
      channelId: "openai-developer",
      role: "supporting",
    });
  });

  it("parses Anthropic date bullets as separate records", () => {
    const channel = anthropic.channels.find(
      (candidate) => candidate.channelId === "anthropic-release-notes"
    )!;
    const records = parseMarkdownReleaseNotes(
      fixtures.anthropicMarkdown,
      anthropic,
      channel
    );

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.publishedAt)).toEqual([
      "2026-07-24T12:00:00.000Z",
      "2026-07-24T12:00:00.000Z",
      "2026-06-30T12:00:00.000Z",
    ]);
    expect(records[0].title).toContain("Claude Opus 5");
    expect(records[2].title).toContain("Claude Sonnet 5");
  });

  it("keeps release-note IDs stable for identical source content", () => {
    const channel = openAi.channels.find(
      (candidate) => candidate.channelId === "openai-developer"
    )!;
    const first = parseMarkdownReleaseNotes(
      fixtures.openAiMarkdown,
      openAi,
      channel
    );
    const second = parseMarkdownReleaseNotes(
      fixtures.openAiMarkdown,
      openAi,
      channel
    );

    expect(second.map((record) => record.id)).toEqual(
      first.map((record) => record.id)
    );
  });
});

describe("official launch diagnostics and evidence", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects Interaction Models without explicit launch availability", () => {
    const record = sourceRecord({
      id: "thinking-interaction-models",
      organizationId: "thinking-machines",
      channelId: "thinking-machines-connectionism",
      sourceType: "blog",
      authority: 82,
      role: "supporting",
      title: "Interaction Models: A Scalable Approach to Human-AI Collaboration",
      summary:
        "Today, we're announcing a research preview of interaction models that handle interaction natively.",
      url: "https://thinkingmachines.ai/blog/interaction-models/",
      canonicalUrl: "https://thinkingmachines.ai/blog/interaction-models",
    });

    expect(hasExplicitLaunchEvidence(`${record.title} ${record.summary}`)).toBe(
      false
    );
    expect(deterministicExtract(record, thinkingMachines)).toBeNull();
  });

  it("can run the deterministic comparison without clearing the loaded API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "loaded-for-acceptance");
    const fetchSpy = vi.fn(() => {
      throw new Error("LLM should not be called in deterministic mode");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const records = await qualifyLaunchRecords([sourceRecord()], openAi, {
      mode: "deterministic",
    });

    expect(records).toHaveLength(1);
    expect(records[0].qualificationMethod).toBe("deterministic");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("persists every supported diagnostic reason", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "official-launch-diag-"));
    vi.stubEnv("CACHE_DIR", cacheDir);
    const reasons: OfficialLaunchDiagnosticReason[] = [
      "non-launch",
      "excluded-content-type",
      "duplicate",
      "semantic-merge",
      "below-tier-threshold",
      "fetch-failure",
      "extraction-failure",
    ];
    const collector = new OfficialLaunchDiagnosticsCollector(reasons.length);
    reasons.forEach((reason, index) =>
      collector.record({
        candidateId: `candidate-${index}`,
        organizationId: "openai",
        stage:
          reason === "fetch-failure"
            ? "fetch"
            : reason === "semantic-merge"
              ? "match"
              : "qualification",
        status:
          reason === "semantic-merge"
            ? "merged"
            : reason.endsWith("failure")
              ? "failed"
              : "rejected",
        reason,
        method: "deterministic",
      })
    );

    await persistOfficialLaunchRun(collector.finish(0));
    const [saved] = await listOfficialLaunchRuns(1);
    expect(saved.runId).toBe(collector.runId);
    expect(saved.candidates.map((item) => item.reason)).toEqual(reasons);
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("emits duplicate, non-launch, exclusion, merge, and threshold diagnostics", async () => {
    const collector = new OfficialLaunchDiagnosticsCollector(8);
    const duplicate = sourceRecord({
      id: "duplicate",
      canonicalUrl: sourceRecord().canonicalUrl,
    });
    expect(
      deterministicDedupe([sourceRecord(), duplicate], collector)
    ).toHaveLength(1);

    await qualifyLaunchRecords(
      [
        sourceRecord({
          id: "excluded",
          title: "OpenAI developer conference",
          summary: "Register for our upcoming event.",
        }),
        sourceRecord({
          id: "non-launch",
          title: "How teams use AI",
          summary: "A customer workflow story.",
        }),
      ],
      openAi,
      { diagnostics: collector }
    );

    await buildOfficialLaunchEvents(
      fixtureRecords(
        fixtures.openAiCrossChannel as Array<
          Omit<OfficialLaunchSourceRecord, "originalContent">
        >
      ),
      { diagnostics: collector, persistDiagnostics: false }
    );
    await buildOfficialLaunchEvents(
      [
        sourceRecord({
          id: "below-threshold",
          organizationId: "thinking-machines",
          channelId: "thinking-machines-news",
          sourceType: "launch-page",
          authority: 100,
          title: "Announcing Tinker platform for teams",
          summary: "Thinking Machines is launching Tinker for teams.",
          url: "https://thinkingmachines.ai/news/tinker-teams",
          canonicalUrl: "https://thinkingmachines.ai/news/tinker-teams",
        }),
      ],
      { diagnostics: collector, persistDiagnostics: false }
    );

    const reasons = collector
      .finish(0)
      .candidates.map((candidate) => candidate.reason);
    expect(reasons).toEqual(
      expect.arrayContaining([
        "duplicate",
        "excluded-content-type",
        "non-launch",
        "semantic-merge",
        "below-tier-threshold",
      ])
    );
  });

  it("records semantic decision method metadata", async () => {
    const base = deterministicExtract(sourceRecord(), openAi)!;
    const left: QualifiedLaunchRecord = {
      ...base,
      id: "semantic-left",
      title: "Codex cloud tasks available",
      entities: { company: "OpenAI", product: "Codex" },
      eventType: "product-launch",
    };
    const right: QualifiedLaunchRecord = {
      ...base,
      id: "semantic-right",
      title: "Codex launches agent execution",
      url: "https://platform.openai.com/docs/codex/agent-execution",
      canonicalUrl:
        "https://platform.openai.com/docs/codex/agent-execution",
      entities: { company: "OpenAI", product: "Codex" },
      eventType: "product-launch",
    };
    const collector = new OfficialLaunchDiagnosticsCollector(2);

    const matches = await matchCandidatePairs(
      [left, right],
      async () => true,
      { diagnostics: collector, deciderMethod: "openai-api" }
    );

    expect(matches).toEqual([[0, 1]]);
    expect(
      collector.finish(1).candidates.find(
        (candidate) => candidate.stage === "match"
      )
    ).toMatchObject({
      status: "merged",
      reason: "semantic-merge",
      method: "openai-api",
    });
  });
});

describe("cross-channel event boundaries", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("clusters OpenAI and Anthropic supporting records under newsroom primaries", async () => {
    for (const records of [
      fixtures.openAiCrossChannel,
      fixtures.anthropicCrossChannel,
    ]) {
      const events = await buildOfficialLaunchEvents(
        fixtureRecords(
          records as Array<
            Omit<OfficialLaunchSourceRecord, "originalContent">
          >
        ),
        { persistDiagnostics: false }
      );
      expect(events).toHaveLength(1);
      expect(events[0].sources.length).toBeGreaterThan(1);
      expect(events[0].primarySource.role).toBe("primary");
      expect(events[0].primarySource.sourceType).toBe("newsroom");
      expect(officialLaunchEventsToFeedItems(events)).toHaveLength(1);
    }
  });

  it("keeps distinct same-product same-day events and Feed IDs separate", async () => {
    const events = await buildOfficialLaunchEvents(
      [
        sourceRecord({
          id: "claude-workspace-controls",
          organizationId: "anthropic",
          channelId: "anthropic-release-notes",
          sourceType: "changelog",
          authority: 76,
          role: "supporting",
          title: "Introducing Claude workspace controls",
          summary: "Claude workspace controls are available today.",
          url: "https://platform.claude.com/docs/workspace-controls",
          canonicalUrl: "https://platform.claude.com/docs/workspace-controls",
        }),
        sourceRecord({
          id: "claude-audit-exports",
          organizationId: "anthropic",
          channelId: "anthropic-release-notes",
          sourceType: "changelog",
          authority: 76,
          role: "supporting",
          title: "Introducing Claude audit exports",
          summary: "Claude audit exports are available today.",
          url: "https://platform.claude.com/docs/audit-exports",
          canonicalUrl: "https://platform.claude.com/docs/audit-exports",
        }),
      ],
      { persistDiagnostics: false }
    );
    const items = officialLaunchEventsToFeedItems(events);

    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.eventId)).size).toBe(2);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });
});
