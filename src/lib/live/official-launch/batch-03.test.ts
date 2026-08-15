import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "@/lib/live/official-launch/batch-03.fixtures.json";
import type { OfficialLaunchSourceRecord } from "@/lib/types";
import {
  OFFICIAL_LAUNCH_ORGANIZATIONS,
  getOfficialLaunchOrganization,
} from "@/lib/live/official-launch/config";
import {
  parseHtmlListChannel,
  parseMarkdownReleaseNotes,
} from "@/lib/live/official-launch/adapters";
import { deterministicExtract } from "@/lib/live/official-launch/extract";
import { buildOfficialLaunchEvents } from "@/lib/live/official-launch";
import { officialLaunchEventsToFeedItems } from "@/lib/live/official-launch/to-feed-item";
import { RSS_SOURCES } from "@/lib/live/rss";

const prime = getOfficialLaunchOrganization("prime-intellect")!;
const moonshot = getOfficialLaunchOrganization("moonshot")!;
const minimax = getOfficialLaunchOrganization("minimax")!;
const thinkingMachines = getOfficialLaunchOrganization("thinking-machines")!;

function asRecord(
  record: Record<string, unknown>
): OfficialLaunchSourceRecord {
  return {
    ...(record as Omit<OfficialLaunchSourceRecord, "originalContent">),
    originalContent: String(record.summary ?? ""),
  };
}

function fixtureRecords(
  records: Array<Record<string, unknown>>
): OfficialLaunchSourceRecord[] {
  return records.map(asRecord);
}

describe("Batch 03 organization configs", () => {
  it("registers three Emerging labs with the frozen Thinking Machines thresholds", () => {
    expect(
      [prime, moonshot, minimax].map((organization) => organization.tier)
    ).toEqual(["emerging", "emerging", "emerging"]);
    for (const organization of [prime, moonshot, minimax]) {
      expect(organization.publishThresholds).toEqual(
        thinkingMachines.publishThresholds
      );
      expect(
        organization.channels.find((channel) => channel.role === "signal")
          ?.enabled
      ).toBe(false);
    }
  });

  it("does not add held or blocked Batch 03 orgs, newsrooms, or GitHub atoms", () => {
    expect(
      OFFICIAL_LAUNCH_ORGANIZATIONS.map(
        (organization) => organization.organizationId
      )
    ).not.toEqual(
      expect.arrayContaining(["zhipu", "stepfun", "genlabs", "world-labs"])
    );
    expect(minimax.channels.map((channel) => channel.url).join(" ")).not.toMatch(
      /minimax\.io\/news|github\.com\/MiniMax/i
    );
    expect(prime.channels.map((channel) => channel.url).join(" ")).not.toMatch(
      /github\.com/i
    );
  });

  it("isolates Moonshot from the legacy Kimi RSS path", () => {
    expect(
      RSS_SOURCES.filter((source) => source.source === "Kimi")
    ).toEqual([]);
  });
});

describe("Prime Intellect", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses blog HTML with stable IDs and dated entries", () => {
    const channel = prime.channels.find(
      (candidate) => candidate.channelId === "prime-intellect-blog"
    )!;
    const first = parseHtmlListChannel(fixtures.primeHtml, prime, channel);
    const second = parseHtmlListChannel(fixtures.primeHtml, prime, channel);
    expect(first.map((record) => record.title)).toEqual([
      "Introducing Lab: The Full-Stack Platform for Training your Own Models",
      "INTELLECT-3: A 100B+ MoE trained with large-scale RL",
      "INTELLECT-2 Release: The First 32B Parameter Model Trained Through Globally Distributed RL",
      "$130M Series A to Build the Open Superintelligence Stack",
      "Prime Intellect Joins the NVIDIA Nemotron Coalition to Advance Open Models",
    ]);
    expect(first[0]).toMatchObject({
      publishedAt: "2026-02-10T12:00:00.000Z",
      authority: 94,
      channelId: "prime-intellect-blog",
    });
    expect(second.map((record) => record.id)).toEqual(
      first.map((record) => record.id)
    );
  });

  it("publishes a named model launch and drops Lab / partnerships at Emerging", async () => {
    expect(
      deterministicExtract(asRecord(fixtures.primeIntellect2Release), prime)
    ).toMatchObject({
      eventType: "open-source-release",
      entities: { model: "INTELLECT-2" },
      noveltyScore: expect.any(Number),
    });
    const published = await buildOfficialLaunchEvents(
      fixtureRecords([fixtures.primeIntellect2Release]),
      { persistDiagnostics: false }
    );
    expect(published).toHaveLength(1);
    expect(officialLaunchEventsToFeedItems(published)).toHaveLength(1);

    expect(
      deterministicExtract(asRecord(fixtures.primeLab), prime)
    ).not.toBeNull();
    expect(
      await buildOfficialLaunchEvents(fixtureRecords([fixtures.primeLab]), {
        persistDiagnostics: false,
      })
    ).toEqual([]);

    expect(
      deterministicExtract(asRecord(fixtures.primeIntellect3Listing), prime)
    ).toBeNull();
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.primeIntellect2Release,
          id: "prime-partner",
          title:
            "Prime Intellect Joins the NVIDIA Nemotron Coalition to Advance Open Models",
          summary: "A partnership announcement with NVIDIA.",
        }),
        prime
      )
    ).toBeNull();
  });
});

describe("Moonshot AI / Kimi", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses the official Kimi blog listing with stable IDs", () => {
    const channel = moonshot.channels.find(
      (candidate) => candidate.channelId === "moonshot-blog"
    )!;
    const first = parseHtmlListChannel(fixtures.moonshotHtml, moonshot, channel);
    expect(first.map((record) => record.title)).toEqual([
      "Kimi K3 Open Frontier Intelligence",
      "PerceptionBench Atomic Visual Perception in MLLMs",
      "Kimi K2.6 Advancing Open-Source Coding",
    ]);
    expect(first[0]).toMatchObject({
      publishedAt: "2026-07-16T12:00:00.000Z",
      url: "https://www.kimi.com/blog/kimi-k3",
    });
    expect(
      parseHtmlListChannel(fixtures.moonshotHtml, moonshot, channel).map(
        (record) => record.id
      )
    ).toEqual(first.map((record) => record.id));
  });

  it("publishes Kimi K3 and rejects research-only / hiring posts", async () => {
    expect(
      deterministicExtract(asRecord(fixtures.moonshotK3), moonshot)
    ).toMatchObject({
      eventType: "api-release",
      entities: { model: "Kimi K3" },
    });
    const events = await buildOfficialLaunchEvents(
      fixtureRecords([fixtures.moonshotK3]),
      { persistDiagnostics: false }
    );
    expect(events).toHaveLength(1);
    expect(officialLaunchEventsToFeedItems(events)[0].source).toBe("Kimi");
    expect(
      deterministicExtract(asRecord(fixtures.moonshotResearch), moonshot)
    ).toBeNull();
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.moonshotK3,
          id: "moonshot-hiring",
          title: "Moonshot AI is hiring research engineers",
          summary: "Join our team to build the next model.",
        }),
        moonshot
      )
    ).toBeNull();
  });
});

describe("MiniMax", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses blog HTML and skips newsroom-only links", () => {
    const channel = minimax.channels.find(
      (candidate) => candidate.channelId === "minimax-blog"
    )!;
    const records = parseHtmlListChannel(fixtures.minimaxHtml, minimax, channel);
    expect(records.map((record) => record.title)).toEqual([
      "Introducing MiniMax M3",
      "MiniMax H3: An Open Model Breaking the Boundaries Between Tasks and Modalities",
      "Sparse Token Forgetting",
    ]);
    expect(records.map((record) => record.url)).not.toContain(
      "https://www.minimax.io/news/minimax-speech-28"
    );
    expect(records[0].publishedAt).toBe("2026-06-01T12:00:00.000Z");
  });

  it("parses API release-note date bullets with stable IDs", () => {
    const channel = minimax.channels.find(
      (candidate) => candidate.channelId === "minimax-release-notes"
    )!;
    const first = parseMarkdownReleaseNotes(
      fixtures.minimaxMarkdown,
      minimax,
      channel
    );
    const second = parseMarkdownReleaseNotes(
      fixtures.minimaxMarkdown,
      minimax,
      channel
    );
    expect(first.map((record) => record.publishedAt)).toEqual([
      "2025-10-28T12:00:00.000Z",
      "2026-06-01T12:00:00.000Z",
    ]);
    expect(first[0].title).toContain("MiniMax-Hailuo-2.3");
    expect(second.map((record) => record.id)).toEqual(
      first.map((record) => record.id)
    );
  });

  it("clusters blog + API notes and keeps M3 / M2.7 separate", async () => {
    const clustered = await buildOfficialLaunchEvents(
      fixtureRecords([fixtures.minimaxM3Blog, fixtures.minimaxM3Notes]),
      { persistDiagnostics: false }
    );
    expect(clustered).toHaveLength(1);
    expect(clustered[0].primarySource.channelId).toBe("minimax-blog");
    expect(officialLaunchEventsToFeedItems(clustered)).toHaveLength(1);

    const versions = await buildOfficialLaunchEvents(
      fixtureRecords(fixtures.minimaxDistinctVersions),
      { persistDiagnostics: false }
    );
    expect(versions).toHaveLength(2);
    expect(versions.map((event) => event.entities.model).sort()).toEqual([
      "MiniMax M2.7",
      "MiniMax M3",
    ]);
  });

  it("qualifies an open-source H3 post but does not publish it under Emerging", async () => {
    const extracted = deterministicExtract(
      asRecord(fixtures.minimaxH3OpenSource),
      minimax
    );
    expect(extracted).not.toBeNull();
    expect(extracted?.noveltyScore).toBeLessThan(
      minimax.publishThresholds.novelty
    );
    expect(
      await buildOfficialLaunchEvents(
        fixtureRecords([fixtures.minimaxH3OpenSource]),
        { persistDiagnostics: false }
      )
    ).toEqual([]);
  });
});
