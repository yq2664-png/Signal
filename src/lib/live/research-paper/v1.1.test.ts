import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import fixtures from "@/lib/live/research-paper/validation.fixtures.json";
import { qualifyResearchPaper } from "@/lib/live/research-paper/gate";
import {
  buildResearchPapers,
  unionCaptures,
} from "@/lib/live/research-paper";
import { matchTaxonomy } from "@/lib/live/research-paper/taxonomy";
import {
  TRUSTED_VENUES,
  candidateVenues,
  monitoredVenues,
} from "@/lib/live/research-paper/venues";
import { parseDblpTocXml } from "@/lib/live/research-paper/venue-capture";
import type { HfCaptureRecord } from "@/lib/live/research-paper/hf";
import type { ArxivCanonical } from "@/lib/live/research-paper/arxiv-atom";
import { applyReviewAction, listPublishOverrides, upsertReviewRecords } from "@/lib/live/research-paper/queue";
import { researchPaperToFeedItem } from "@/lib/live/research-paper/to-feed-item";
import { normalizeTitle } from "@/lib/live/research-paper/identity";
import type { ResearchPaper } from "@/lib/types";

const locked = fixtures.papers.filter((paper) => paper.lockedSet);

function asCapture(
  fixture: (typeof fixtures.papers)[number],
  extra: Partial<HfCaptureRecord> = {}
): HfCaptureRecord {
  return {
    arxivId: fixture.arxivId,
    title: fixture.title,
    abstract: fixture.abstract,
    authors: fixture.authors,
    publishedAt: fixture.publishedAt,
    hfSubmittedAt: extra.hfSubmittedAt ?? "2026-08-14T00:00:00.000Z",
    upvotes: extra.upvotes,
    ...extra,
  };
}

function canonicalFor(
  fixture: (typeof fixtures.papers)[number]
): [string, ArxivCanonical] {
  return [
    fixture.arxivId,
    {
      arxivId: fixture.arxivId,
      title: fixture.title,
      abstract: fixture.abstract,
      authors: fixture.authors,
      categories: fixture.categories,
      publishedAt: fixture.publishedAt,
    },
  ];
}

describe("Research Paper V1.1 taxonomy prefilter", () => {
  it("captures user-facing AI topics and rejects keyword-irrelevant papers", () => {
    expect(
      matchTaxonomy(
        "An agentic workflow for computer use",
        "An AI assistant that plans tool use."
      ).capture
    ).toBe(true);
    expect(
      matchTaxonomy(
        "Photosynthesis rates in Arabidopsis thaliana",
        "Chloroplast measurements under drought stress."
      ).capture
    ).toBe(false);
    expect(
      matchTaxonomy(
        "Speculative decoding for transformer serving",
        "We accelerate inference with draft tokens."
      ).capture
    ).toBe(false);
  });

  it("does not let taxonomy publish; R1–R6 still decide", () => {
    const captured: HfCaptureRecord = {
      arxivId: "2600.00001",
      title: "An agentic workflow for computer use",
      abstract:
        "We study sample complexity and VC classes for an AI assistant with tool use.",
      authors: ["Ada Lovelace"],
      publishedAt: "2026-08-14T00:00:00.000Z",
      hfSubmittedAt: "2026-08-14T00:00:00.000Z",
      venue: "NeurIPS",
      venueTier: "A",
      captureSource: "dblp",
      topic: "agents",
    };
    expect(matchTaxonomy(captured.title, captured.abstract).capture).toBe(true);
    const decision = qualifyResearchPaper(captured.title, captured.abstract);
    expect(decision.publish).toBe(false);
    expect(decision.reason).toBe("r1-theory");
    const built = buildResearchPapers([captured], {
      now: new Date("2026-08-15T12:00:00.000Z"),
      canonicalById: new Map([
        [
          captured.arxivId,
          {
            arxivId: captured.arxivId,
            title: captured.title,
            abstract: captured.abstract,
            authors: captured.authors,
            categories: ["cs.AI"],
            publishedAt: captured.publishedAt!,
          },
        ],
      ]),
    });
    expect(built.items).toHaveLength(0);
    expect(built.reviewQueue).toHaveLength(1);
  });
});

describe("Research Paper V1.1 trusted venues", () => {
  it("parses DBLP conference TOC XML without using the search API", () => {
    const parsed = parseDblpTocXml(`
      <bht>
        <inproceedings key="conf/chi/Example2026">
          <author>Ada Lovelace</author>
          <title>Hey Dashboard!: Supporting Voice Interfaces with Large Language Models.</title>
          <ee>https://doi.org/10.1145/example.chi</ee>
          <ee>https://arxiv.org/abs/2601.12345</ee>
          <year>2026</year>
        </inproceedings>
        <inproceedings key="conf/chi/Skip2026">
          <title>Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems</title>
        </inproceedings>
      </bht>
    `);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      title: "Hey Dashboard!: Supporting Voice Interfaces with Large Language Models.",
      doi: "10.1145/example.chi",
      arxivId: "2601.12345",
    });
    expect(
      parseDblpTocXml(`
        <inproceedings>
          <title>DOI only CHI paper about an AI assistant interface.</title>
          <ee>https://doi.org/10.1145/3772318.3790721</ee>
        </inproceedings>
      `)[0]?.arxivId
    ).toBe("");
  });

  it("never auto-fetches Candidate venues", () => {
    expect(monitoredVenues().every((venue) => venue.tier !== "candidate")).toBe(
      true
    );
    expect(candidateVenues().map((venue) => venue.id).sort()).toEqual(
      [
        "ai-journal",
        "colm",
        "corl",
        "dis",
        "facct",
        "hri",
        "iros",
        "iui",
        "jmlr",
        "naacl",
        "tacl",
        "tnnls",
      ].sort()
    );
    expect(
      candidateVenues().every(
        (venue) => !venue.dblpStream && !venue.openAlexSourceId
      )
    ).toBe(true);
    expect(TRUSTED_VENUES.some((venue) => venue.id === "chi")).toBe(true);
  });

  it("does not ingest Google Scholar", async () => {
    const files = [
      "src/lib/live/research-paper/venue-capture.ts",
      "src/lib/live/research-paper/discovery.ts",
      "src/lib/live/research-paper/index.ts",
      "src/lib/live/research-paper/venues.ts",
    ];
    for (const file of files) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/scholar\.google/i);
      expect(source).not.toMatch(/googleapis.com\/customsearch/i);
    }
  });
});

describe("Research Paper V1.1 capture union", () => {
  it("unions HF and venue on existing identity keys, HF first", () => {
    const mem0 = locked.find((paper) => paper.arxivId === "2504.19413")!;
    const hf = asCapture(mem0, { captureSource: "hf" });
    const venue: HfCaptureRecord = {
      ...asCapture(mem0, { captureSource: "dblp", venue: "NeurIPS" }),
      title: "Mem0 listed at NeurIPS",
    };
    const unioned = unionCaptures([hf], [venue]);
    expect(unioned).toHaveLength(1);
    expect(unioned[0]?.captureSource).toBe("hf");
    expect(unioned[0]?.title).toBe(mem0.title);
  });

  it("keeps CHI / DOI papers without arXiv ids", () => {
    const captured: HfCaptureRecord = {
      arxivId: "",
      title: "Co-designing conversational interfaces with people with disabilities",
      abstract:
        "We co-designed protection mechanisms with people with disabilities using a conversational interface for digital products.",
      authors: ["Chi Author"],
      publishedAt: "2026-08-14T00:00:00.000Z",
      hfSubmittedAt: "2026-08-14T00:00:00.000Z",
      doi: "10.1145/example.chi",
      venue: "CHI",
      venueTier: "A",
      captureSource: "dblp",
      url: "https://doi.org/10.1145/example.chi",
      topic: "human-ai-interaction",
    };
    const built = buildResearchPapers([captured], {
      now: new Date("2026-08-15T12:00:00.000Z"),
    });
    expect(built.items.length).toBeGreaterThan(0);
    expect(built.items[0]?.id).toMatch(/^doi-/);
    expect(built.items[0]?.url).toContain("10.1145/example.chi");
    expect(built.papers[0]?.arxivId).toBe("");
  });
});

describe("Research Paper V1.1 Watch and Review Queue", () => {
  it("routes R4-without-R5 and capped PASS to Watch, R1–R3/R6 to Review Queue", () => {
    const pass = locked.filter((paper) => paper.expectedLabel === "PASS");
    const fail = locked.filter((paper) => paper.expectedLabel === "FAIL");
    const watchCandidate: HfCaptureRecord = {
      arxivId: "2600.00002",
      title: "Memory-centric agents for multi-session work",
      abstract:
        "We present a long-term memory module for AI scientists and research workflows.",
      authors: ["Watch Author"],
      publishedAt: "2026-08-14T00:00:00.000Z",
      hfSubmittedAt: "2026-08-14T00:00:00.000Z",
    };
    const decision = qualifyResearchPaper(
      watchCandidate.title,
      watchCandidate.abstract
    );
    expect(decision.publish).toBe(false);
    expect(decision.passCandidate).toBe(true);

    const captured = [
      ...pass.map((paper) => asCapture(paper)),
      ...fail.map((paper) => asCapture(paper)),
      watchCandidate,
    ];
    const built = buildResearchPapers(captured, {
      now: new Date("2026-08-15T12:00:00.000Z"),
      publishCap: 6,
      canonicalById: new Map(captured.filter((row) => row.arxivId).map((row) => [
        row.arxivId,
        {
          arxivId: row.arxivId,
          title: row.title,
          abstract: row.abstract,
          authors: row.authors,
          categories: ["cs.AI"],
          publishedAt: row.publishedAt || row.hfSubmittedAt || "",
        },
      ])),
    });

    expect(built.items).toHaveLength(6);
    expect(built.watch.some((row) => row.decisionRule === "capped")).toBe(true);
    expect(
      built.watch.some((row) => row.arxivId === "2600.00002")
    ).toBe(true);
    expect(
      fail.every((paper) =>
        built.reviewQueue.some((row) => row.arxivId === paper.arxivId)
      )
    ).toBe(true);
  });

  it("lets Approve for Publish compete for cap 6 without changing the gate function", () => {
    const bdh = locked.find((paper) => paper.arxivId === "2608.09888")!;
    const gate = qualifyResearchPaper(bdh.title, bdh.abstract);
    expect(gate.publish).toBe(false);
    const built = buildResearchPapers([asCapture(bdh)], {
      now: new Date("2026-08-15T12:00:00.000Z"),
      canonicalById: new Map([canonicalFor(bdh)]),
      forcePublishIds: new Set([bdh.arxivId]),
    });
    expect(qualifyResearchPaper(bdh.title, bdh.abstract).publish).toBe(false);
    expect(built.items).toHaveLength(1);
    expect(built.items[0]?.researchPaper?.arxivId).toBe(bdh.arxivId);
  });

  it("does not raise the publish cap when extra PASS papers arrive from venues", () => {
    const pass = locked.filter((paper) => paper.expectedLabel === "PASS");
    const extra: HfCaptureRecord = {
      arxivId: "2600.00003",
      title: "Co-designed protection mechanisms for people with disabilities",
      abstract:
        pass[0]?.abstract ||
        "We co-designed protection mechanisms with people with disabilities for digital products.",
      authors: ["Venue Author"],
      publishedAt: "2026-08-14T00:00:00.000Z",
      hfSubmittedAt: "2026-08-13T00:00:00.000Z",
      venue: "CHI",
      venueTier: "A",
      captureSource: "dblp",
    };
    const captured = [...pass.map((paper) => asCapture(paper)), extra];
    const built = buildResearchPapers(captured, {
      now: new Date("2026-08-15T12:00:00.000Z"),
      publishCap: 6,
      canonicalById: new Map(
        captured.map((row) => [
          row.arxivId,
          {
            arxivId: row.arxivId,
            title: row.title,
            abstract: row.abstract,
            authors: row.authors,
            categories: ["cs.HC"],
            publishedAt: row.publishedAt || "",
          },
        ])
      ),
    });
    expect(built.items).toHaveLength(6);
    expect(built.diagnostics.counts.published).toBe(6);
    expect(built.watch.some((row) => row.decisionRule === "capped")).toBe(true);
  });
});

describe("Research Paper V1.1 admin queue persistence", () => {
  const originalCache = process.env.CACHE_DIR;
  let dir: string;

  afterEach(async () => {
    if (originalCache === undefined) delete process.env.CACHE_DIR;
    else process.env.CACHE_DIR = originalCache;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("stores queue fields and applies per-paper overrides only", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "rp-queue-"));
    process.env.CACHE_DIR = dir;
    await upsertReviewRecords([
      {
        id: "rec-1",
        state: "review-queue",
        title: "Rejected theory paper",
        venue: "ICML",
        arxivId: "2600.00004",
        topic: "training",
        decisionRule: "r1-theory",
        rejectionReason: "r1-theory",
        evidence: "VC classes",
        timestamp: "2026-08-15T00:00:00.000Z",
        notes: [],
      },
    ]);
    const moved = await applyReviewAction({
      id: "rec-1",
      action: "approve-publish",
      note: "PM-relevant despite theory framing",
    });
    expect(moved?.override).toBe("publish");
    expect(moved?.notes).toContain("PM-relevant despite theory framing");
    expect(await listPublishOverrides()).toEqual(["2600.00004"]);
    const afterGate = qualifyResearchPaper(
      "Convex calibration of VC classes",
      "We bound sample complexity without users or an interface."
    );
    expect(afterGate.publish).toBe(false);
  });
});

describe("Research Paper V1.1 venue recall (frozen gate)", () => {
  it("lets a CHI co-design paper reach Watch without venue auto-publish", () => {
    const title =
      "Towards Considerate Embodied AI: Co-Designing Situated Multi-Site Healthcare Robots from Abstract Concepts to High-Fidelity Prototypes.";
    expect(matchTaxonomy(title, "", { hciVenue: true }).capture).toBe(true);
    const decision = qualifyResearchPaper(title, "");
    expect(decision.passCandidate).toBe(true);
    expect(decision.publish).toBe(false);
    expect(decision.cue).toBe("HCI");
    expect(decision.reason).toBe("r6-else");
  });

  it("still rejects a top-venue CHI paper that misses R1–R6", () => {
    const title =
      "Making Multimodal LLMs Reliable Chart Data Extractors: A Benchmark and Training Framework.";
    expect(matchTaxonomy(title, "", { hciVenue: true }).capture).toBe(true);
    const decision = qualifyResearchPaper(title, "");
    expect(decision.publish).toBe(false);
    expect(decision.passCandidate).toBe(false);
    expect(decision.reason).toBe("r3-incremental");
  });
});

describe("Research Paper V1.1 feed mapping", () => {
  it("maps DOI-only papers onto the existing FeedItem contract", () => {
    const paper: ResearchPaper = {
      arxivId: "",
      doi: "10.1145/example.chi",
      title: "CHI paper",
      titleNorm: normalizeTitle("CHI paper"),
      abstract: "People with disabilities using a conversational interface.",
      authors: ["A Author"],
      categories: ["cs.HC"],
      publishedAt: "2026-08-14T00:00:00.000Z",
      url: "https://doi.org/10.1145/example.chi",
      venue: "CHI",
    };
    const item = researchPaperToFeedItem(paper, "HCI");
    expect(item.category).toBe("Research Papers");
    expect(item.tags).toContain("research-paper");
    expect(item.brief).toEqual(
      expect.objectContaining({
        whatHappened: expect.any(String),
        whyItMatters: expect.any(String),
        potentialImpact: expect.any(String),
        keyTakeaway: expect.any(String),
      })
    );
  });
});
