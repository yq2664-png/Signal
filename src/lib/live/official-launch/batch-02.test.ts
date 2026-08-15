import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "@/lib/live/official-launch/batch-02.fixtures.json";
import type { OfficialLaunchSourceRecord } from "@/lib/types";
import {
  getOfficialLaunchOrganization,
} from "@/lib/live/official-launch/config";
import {
  parseHtmlListChannel,
  parseHtmlReleaseNotes,
  parseRssChannel,
} from "@/lib/live/official-launch/adapters";
import { deterministicExtract } from "@/lib/live/official-launch/extract";
import { buildOfficialLaunchEvents } from "@/lib/live/official-launch";
import { officialLaunchEventsToFeedItems } from "@/lib/live/official-launch/to-feed-item";
import {
  identityUrl,
  deterministicDedupe,
} from "@/lib/live/official-launch/dedupe";
import { RSS_SOURCES } from "@/lib/live/rss";

const google = getOfficialLaunchOrganization("google-deepmind")!;
const meta = getOfficialLaunchOrganization("meta-ai")!;
const xai = getOfficialLaunchOrganization("xai")!;
const deepseek = getOfficialLaunchOrganization("deepseek")!;
const qwen = getOfficialLaunchOrganization("qwen")!;
const mistral = getOfficialLaunchOrganization("mistral")!;

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

describe("Batch 02 organization configs", () => {
  it("registers six Core labs without enabling social signal channels", () => {
    expect(
      [google, meta, xai, deepseek, qwen, mistral].map(
        (organization) => organization.tier
      )
    ).toEqual(["core", "core", "core", "core", "core", "core"]);
    for (const organization of [google, meta, xai, qwen, mistral]) {
      const signal = organization.channels.find(
        (channel) => channel.role === "signal"
      );
      expect(signal?.enabled).toBe(false);
    }
  });

  it("keeps Google DeepMind and DeepSeek off the legacy RSS path", () => {
    expect(
      RSS_SOURCES.filter((source) =>
        ["Google DeepMind", "DeepSeek"].includes(source.source)
      )
    ).toEqual([]);
  });
});

describe("Google / DeepMind", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses newsroom RSS with stable IDs and dated entries", async () => {
    const channel = google.channels.find(
      (candidate) => candidate.channelId === "google-deepmind-news"
    )!;
    const first = await parseRssChannel(fixtures.googleRss, google, channel);
    const second = await parseRssChannel(fixtures.googleRss, google, channel);
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      title: "Introducing Gemini 3.5 Flash Cyber",
      publishedAt: "2026-07-21T12:00:00.000Z",
      channelId: "google-deepmind-news",
    });
    expect(second.map((record) => record.id)).toEqual(
      first.map((record) => record.id)
    );
  });

  it("qualifies Gemini launches and rejects hiring", () => {
    expect(
      deterministicExtract(
        asRecord(fixtures.googleCrossChannel[0]),
        google
      )
    ).toMatchObject({
      eventType: "model-release",
      entities: { model: "Gemini 3.5 Flash", version: "3.5" },
    });
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.googleCrossChannel[0],
          id: "google-hiring",
          title: "Google DeepMind is hiring research scientists",
          summary: "Join our team to build the next model.",
        }),
        google
      )
    ).toBeNull();
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.googleCrossChannel[0],
          id: "google-education",
          title:
            "Empowering India’s next generation of innovators with ATL Saathi",
          summary:
            "Google and AIM launched ATL Saathi, a Gemini-powered AI tool empowering Indian educators in robotics labs.",
        }),
        google
      )
    ).toBeNull();
  });

  it("clusters news + AI blog under the DeepMind newsroom primary", async () => {
    const events = await buildOfficialLaunchEvents(
      fixtureRecords(fixtures.googleCrossChannel),
      { persistDiagnostics: false }
    );
    expect(events).toHaveLength(1);
    expect(events[0].primarySource.channelId).toBe("google-deepmind-news");
    expect(officialLaunchEventsToFeedItems(events)).toHaveLength(1);
  });

  it("keeps Gemini 3.5 and 3.6 as separate events", async () => {
    const events = await buildOfficialLaunchEvents(
      fixtureRecords(fixtures.googleDistinctVersions),
      { persistDiagnostics: false }
    );
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.entities.version).sort()).toEqual([
      "3.5",
      "3.6",
    ]);
  });
});

describe("Meta AI", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses blog HTML, skips featured chrome, and keeps stable IDs", () => {
    const channel = meta.channels.find(
      (candidate) => candidate.channelId === "meta-ai-blog"
    )!;
    const first = parseHtmlListChannel(fixtures.metaHtml, meta, channel);
    const second = parseHtmlListChannel(fixtures.metaHtml, meta, channel);
    expect(first.map((record) => record.title)).toEqual([
      "Introducing Muse Spark 1.1",
      "Reimagining Independence: How Meta’s AI Models Are Helping the University of Pittsburgh Transform Assistive Robotics",
      "The Llama 4 herd: natively multimodal models now available",
      "Introducing TRIBE v2: A Predictive Foundation Model Trained to Understand How the Human Brain Processes Complex Stimuli",
      "Scaling How We Build and Test Our Most Advanced AI",
    ]);
    expect(first[0]).toMatchObject({
      publishedAt: "2026-07-09T12:00:00.000Z",
      authority: 94,
      channelId: "meta-ai-blog",
    });
    expect(first[3].publishedAt).toBe("2026-03-26T12:00:00.000Z");
    expect(first.map((record) => record.url)).not.toContain(
      "https://ai.meta.com/blog/?page=2"
    );
    expect(second.map((record) => record.id)).toEqual(
      first.map((record) => record.id)
    );
  });

  it("qualifies Llama launches and rejects customer stories", () => {
    expect(deterministicExtract(asRecord(fixtures.metaLaunch), meta)).toMatchObject({
      eventType: "open-source-release",
      entities: { model: "Llama 4", version: "4" },
    });
    expect(
      deterministicExtract(
        asRecord({
          id: "meta-muse",
          organizationId: "meta-ai",
          channelId: "meta-ai-blog",
          sourceType: "newsroom",
          authority: 94,
          role: "primary",
          title: "Introducing Muse Spark 1.1",
          summary: "Muse Spark 1.1 is now available through the Meta Model API.",
          url: "https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/",
          canonicalUrl:
            "https://ai.meta.com/blog/introducing-muse-spark-meta-model-api",
          publishedAt: "2026-07-09T12:00:00.000Z",
        }),
        meta
      )
    ).toMatchObject({
      entities: { model: "Muse Spark 1.1", version: "1.1" },
    });
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.metaLaunch,
          id: "meta-excluded",
          title: fixtures.metaExcluded.title,
          summary: fixtures.metaExcluded.summary,
        }),
        meta
      )
    ).toBeNull();
  });
});

describe("xAI", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses news HTML with dates and stable IDs", () => {
    const channel = xai.channels.find(
      (candidate) => candidate.channelId === "xai-news"
    )!;
    const records = parseHtmlListChannel(fixtures.xaiHtml, xai, channel);
    expect(records.map((record) => record.title)).toEqual([
      "Introducing Grok 4.6",
      "Introducing Grok 4.5",
      "xAI is hiring research engineers",
    ]);
    expect(records[0].publishedAt).toBe("2026-08-12T12:00:00.000Z");
    expect(
      parseHtmlListChannel(fixtures.xaiHtml, xai, channel).map(
        (record) => record.id
      )
    ).toEqual(records.map((record) => record.id));
  });

  it("qualifies Grok launches and keeps 4.5 / 4.6 separate", async () => {
    expect(deterministicExtract(asRecord(fixtures.xaiLaunch), xai)).toMatchObject({
      eventType: "api-release",
      entities: { model: "Grok 4.6", version: "4.6" },
    });
    const events = await buildOfficialLaunchEvents(
      fixtureRecords(fixtures.xaiDistinctVersions),
      { persistDiagnostics: false }
    );
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.entities.version).sort()).toEqual([
      "4.5",
      "4.6",
    ]);
  });
});

describe("DeepSeek", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses dated HTML release notes and strips hash-link artifacts", () => {
    const channel = deepseek.channels.find(
      (candidate) => candidate.channelId === "deepseek-updates"
    )!;
    const first = parseHtmlReleaseNotes(fixtures.deepseekHtml, deepseek, channel);
    const second = parseHtmlReleaseNotes(
      fixtures.deepseekHtml,
      deepseek,
      channel
    );
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      title: "DeepSeek-V4-Pro Update",
      publishedAt: "2026-08-13T12:00:00.000Z",
    });
    expect(first[1].title).toBe("DeepSeek-V4-Flash Update");
    expect(first.map((record) => record.title)).not.toContain("deepseek-chat");
    expect(first[1].publishedAt).toBe("2026-07-31T12:00:00.000Z");
    expect(second.map((record) => record.id)).toEqual(
      first.map((record) => record.id)
    );
  });

  it("qualifies V4-Pro GA as an Official Launch", () => {
    expect(
      deterministicExtract(asRecord(fixtures.deepseekLaunch), deepseek)
    ).toMatchObject({
      eventType: "api-release",
      entities: { model: "DeepSeek-V4-Pro" },
    });
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.deepseekLaunch,
          id: "deepseek-hiring",
          title: "DeepSeek is hiring research engineers",
          summary: "Join our team to build the next model.",
        }),
        deepseek
      )
    ).toBeNull();
  });

  it("keeps same-page changelog entries as distinct source records", () => {
    const channel = deepseek.channels.find(
      (candidate) => candidate.channelId === "deepseek-updates"
    )!;
    const records = parseHtmlReleaseNotes(
      fixtures.deepseekHtml,
      deepseek,
      channel
    );
    expect(deterministicDedupe(records)).toHaveLength(records.length);
    expect(new Set(records.map((record) => identityUrl(record.url))).size).toBe(
      records.length
    );
  });
});

describe("Alibaba / Qwen", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses official blog RSS with stable IDs", async () => {
    const channel = qwen.channels.find(
      (candidate) => candidate.channelId === "qwen-blog"
    )!;
    const records = await parseRssChannel(fixtures.qwenRss, qwen, channel);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      title: "Qwen3Guard: Real-time Safety for Your Token Stream",
      publishedAt: "2025-09-22T20:00:00.000Z",
    });
    expect(
      (await parseRssChannel(fixtures.qwenRss, qwen, channel)).map(
        (record) => record.id
      )
    ).toEqual(records.map((record) => record.id));
  });

  it("qualifies open-source Qwen launches and rejects hiring", () => {
    expect(deterministicExtract(asRecord(fixtures.qwenLaunch), qwen)).toMatchObject({
      eventType: "open-source-release",
      entities: { model: "Qwen3Guard" },
    });
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.qwenLaunch,
          id: "qwen-introduce",
          title: "Qwen3Guard: Real-time Safety for Your Token Stream",
          summary:
            "We are excited to introduce Qwen3Guard, now available as an open-source safety model.",
        }),
        qwen
      )
    ).toMatchObject({
      eventType: "open-source-release",
      entities: { model: "Qwen3Guard" },
    });
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.qwenLaunch,
          id: "qwen-hiring",
          title: "Qwen is hiring research engineers",
          summary: "Join our team to build the next model.",
        }),
        qwen
      )
    ).toBeNull();
  });
});

describe("Mistral AI", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("parses news RSS with stable IDs", async () => {
    const channel = mistral.channels.find(
      (candidate) => candidate.channelId === "mistral-news"
    )!;
    const records = await parseRssChannel(fixtures.mistralRss, mistral, channel);
    expect(records[0]).toMatchObject({
      title: "Introducing Shieldstral.",
      publishedAt: "2026-08-04T12:00:00.000Z",
    });
    expect(
      (await parseRssChannel(fixtures.mistralRss, mistral, channel)).map(
        (record) => record.id
      )
    ).toEqual(records.map((record) => record.id));
  });

  it("qualifies Shieldstral and rejects partnership posts", () => {
    expect(
      deterministicExtract(asRecord(fixtures.mistralLaunch), mistral)
    ).toMatchObject({
      eventType: "api-release",
      entities: { model: "Shieldstral" },
    });
    expect(
      deterministicExtract(
        asRecord({
          ...fixtures.mistralLaunch,
          id: "mistral-partner",
          title:
            "Mistral AI partners with NVIDIA to accelerate open frontier models",
          summary: "A partnership announcement with NVIDIA.",
        }),
        mistral
      )
    ).toBeNull();
  });
});
