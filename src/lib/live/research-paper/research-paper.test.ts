import { describe, expect, it } from "vitest";
import fixtures from "@/lib/live/research-paper/validation.fixtures.json";
import { makeResearchPaperBrief, extractFinding } from "@/lib/live/research-paper/brief";
import { deterministicDedupe } from "@/lib/live/research-paper/dedupe";
import { qualifyResearchPaper } from "@/lib/live/research-paper/gate";
import { parseHfPaper } from "@/lib/live/research-paper/hf";
import { isWithinWindow, normalizeTitle, stripArxivVersion } from "@/lib/live/research-paper/identity";
import { buildResearchPapers } from "@/lib/live/research-paper";
import { researchPaperToFeedItem } from "@/lib/live/research-paper/to-feed-item";
import type { ArxivCanonical } from "@/lib/live/research-paper/arxiv-atom";
import type { HfCaptureRecord } from "@/lib/live/research-paper/hf";
import type { ResearchPaper } from "@/lib/types";

const locked = fixtures.papers.filter((paper) => paper.lockedSet);

function asPaper(
  fixture: (typeof fixtures.papers)[number],
  extra: Partial<ResearchPaper> = {}
): ResearchPaper {
  return {
    arxivId: fixture.arxivId,
    title: fixture.title,
    titleNorm: normalizeTitle(fixture.title),
    abstract: fixture.abstract,
    authors: fixture.authors,
    categories: fixture.categories,
    publishedAt: fixture.publishedAt,
    hfSubmittedAt: fixture.publishedAt,
    url: `https://arxiv.org/abs/${fixture.arxivId}`,
    ...extra,
  };
}

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

describe("Research Paper identity and dedupe", () => {
  it("strips arXiv versions and normalizes titles", () => {
    expect(stripArxivVersion("https://arxiv.org/abs/2504.19413v2")).toBe(
      "2504.19413"
    );
    expect(normalizeTitle("Mem0: Building Production-Ready AI Agents")).toBe(
      "mem0 building production ready ai agents"
    );
  });

  it("dedupes arXiv ID, then DOI, then title+author+day", () => {
    const mem0 = asPaper(locked[0]);
    const byId = deterministicDedupe([
      mem0,
      { ...mem0, title: "Mem0 duplicate listing" },
    ]);
    expect(byId.unique).toHaveLength(1);
    expect(byId.duplicates[0].key).toMatch(/^arxiv:/);

    const byDoi = deterministicDedupe([
      { ...mem0, arxivId: "1111.11111", doi: "10.1/example" },
      { ...mem0, arxivId: "2222.22222", doi: "10.1/example", title: "Other" },
    ]);
    expect(byDoi.unique).toHaveLength(1);
    expect(byDoi.duplicates[0].key).toMatch(/^doi:/);

    const byTitle = deterministicDedupe([
      { ...mem0, arxivId: "", doi: undefined },
      {
        ...mem0,
        arxivId: "",
        doi: undefined,
        title: `${mem0.title}!!!`,
      },
    ]);
    expect(byTitle.unique).toHaveLength(1);
    expect(byTitle.duplicates[0].key).toMatch(/^title:/);
  });
});

describe("Research Paper frozen validation set", () => {
  it("classifies the locked 20 papers without using upvotes", () => {
    for (const fixture of locked) {
      const decision = qualifyResearchPaper(fixture.title, fixture.abstract);
      const published = decision.publish;
      if (fixture.expectedLabel === "PASS") {
        expect(published, fixture.arxivId).toBe(true);
        expect(decision.passCandidate).toBe(true);
      } else {
        expect(published, `${fixture.expectedLabel} ${fixture.arxivId}`).toBe(
          false
        );
        expect(decision.reason, fixture.arxivId).toBe(fixture.expectedReason);
      }
    }
  });

  it("never lets upvotes or trending override a FAIL", () => {
    const bdh = locked.find((paper) => paper.arxivId === "2608.09888")!;
    const decision = qualifyResearchPaper(bdh.title, bdh.abstract);
    expect(decision.publish).toBe(false);
    const captured = asCapture(bdh, {
      upvotes: 605,
      hfSubmittedAt: "2026-08-14T00:00:00.000Z",
    });
    const built = buildResearchPapers([captured], {
      now: new Date("2026-08-15T12:00:00.000Z"),
      windowDays: 7,
      canonicalById: new Map([
        [
          bdh.arxivId,
          {
            arxivId: bdh.arxivId,
            title: bdh.title,
            abstract: bdh.abstract,
            authors: bdh.authors,
            categories: bdh.categories,
            publishedAt: bdh.publishedAt,
          } satisfies ArxivCanonical,
        ],
      ]),
    });
    expect(built.items).toHaveLength(0);
    expect(
      built.diagnostics.candidates.some(
        (candidate) =>
          candidate.arxivId === "2608.09888" &&
          candidate.status === "rejected" &&
          candidate.upvotes === 605
      )
    ).toBe(true);
  });

  it("keeps BORDERLINE papers unpublished", () => {
    const borderline = locked.filter((paper) => paper.expectedLabel === "BORDERLINE");
    expect(borderline.length).toBeGreaterThan(0);
    for (const fixture of borderline) {
      expect(qualifyResearchPaper(fixture.title, fixture.abstract).publish).toBe(
        false
      );
    }
  });
});

describe("Research Paper pipeline", () => {
  it("windows on submittedOnDailyAt and ignores all-time classics", () => {
    const mem0 = locked.find((paper) => paper.arxivId === "2504.19413")!;
    const captured = [
      asCapture(mem0, { hfSubmittedAt: "2019-06-12T00:00:00.000Z" }),
      asCapture(mem0, {
        arxivId: "1706.03762",
        title: "Attention Is All You Need",
        hfSubmittedAt: "2019-06-12T00:00:00.000Z",
      }),
    ];
    const built = buildResearchPapers(captured, {
      now: new Date("2026-08-15T12:00:00.000Z"),
      windowDays: 7,
    });
    expect(built.items).toHaveLength(0);
    expect(built.diagnostics.counts.outsideWindow).toBe(2);
  });

  it("publishes PASS papers inside the window as one FeedItem each", () => {
    const pass = locked.filter((paper) => paper.expectedLabel === "PASS");
    const now = new Date("2026-08-15T12:00:00.000Z");
    const captured = pass.map((paper) =>
      asCapture(paper, { hfSubmittedAt: "2026-08-14T00:00:00.000Z" })
    );
    const canonicalById = new Map(
      pass.map((paper) => [
        paper.arxivId,
        {
          arxivId: paper.arxivId,
          title: paper.title,
          abstract: paper.abstract,
          authors: paper.authors,
          categories: paper.categories,
          publishedAt: paper.publishedAt,
        } satisfies ArxivCanonical,
      ])
    );
    const built = buildResearchPapers(captured, {
      now,
      windowDays: 7,
      publishCap: 6,
      canonicalById,
    });

    expect(built.items.length).toBe(6);
    expect(built.diagnostics.counts.published).toBe(6);
    expect(built.diagnostics.counts.capped).toBe(1);
    expect(new Set(built.items.map((item) => item.researchPaper?.arxivId)).size).toBe(
      6
    );
    for (const item of built.items) {
      expect(item.category).toBe("Research Papers");
      expect(item.brief.whatHappened).not.toMatch(/arXiv published an update/i);
      expect(item.brief).toEqual(
        expect.objectContaining({
          whatHappened: expect.any(String),
          whyItMatters: expect.any(String),
          potentialImpact: expect.any(String),
          keyTakeaway: expect.any(String),
        })
      );
      expect(item.tags).toContain("research-paper");
      expect(item.native?.likes ?? item.native?.points).toBeUndefined();
    }
  });

  it("applies the cap only after relevance filtering", () => {
    const pass = locked.filter((paper) => paper.expectedLabel === "PASS");
    const fail = locked.filter((paper) => paper.expectedLabel === "FAIL");
    const captured = [...pass, ...fail].map((paper, index) =>
      asCapture(paper, {
        hfSubmittedAt: "2026-08-14T00:00:00.000Z",
        upvotes: 1000 - index,
      })
    );
    const built = buildResearchPapers(captured, {
      now: new Date("2026-08-15T12:00:00.000Z"),
      windowDays: 7,
      publishCap: 6,
      canonicalById: new Map(
        [...pass, ...fail].map((paper) => [
          paper.arxivId,
          {
            arxivId: paper.arxivId,
            title: paper.title,
            abstract: paper.abstract,
            authors: paper.authors,
            categories: paper.categories,
            publishedAt: paper.publishedAt,
          } satisfies ArxivCanonical,
        ])
      ),
    });
    expect(built.diagnostics.counts.captured).toBe(pass.length + fail.length);
    expect(built.items.every((item) =>
      pass.some((paper) => paper.arxivId === item.researchPaper?.arxivId)
    )).toBe(true);
    expect(built.diagnostics.counts.capped).toBe(pass.length - 6);
    expect(
      built.items.some((item) => item.researchPaper?.arxivId === "2608.09888")
    ).toBe(false);
  });

  it("maps one published paper to one existing FeedItem and brief", () => {
    const mem0 = locked.find((paper) => paper.arxivId === "2504.19413")!;
    const item = researchPaperToFeedItem(asPaper(mem0, { githubUrl: "https://github.com/mem0ai/mem0" }), "Agent memory");
    expect(item.id).toBe("arxiv-2504-19413");
    expect(item.source).toBe("arXiv");
    expect(item.summary).toBe(extractFinding(mem0.title, mem0.abstract));
    expect(item.brief.whatHappened).toContain("Mem0");
    expect(item.brief.keyTakeaway).toMatch(/code available/i);
    expect(item.native?.subtitle).toBe("Agent memory");
    expect(makeResearchPaperBrief(asPaper(mem0), "Agent memory").whatHappened).not.toMatch(
      /published an update/i
    );
  });
});

describe("Hugging Face capture parsing", () => {
  it("reads nested daily_papers paper.id as the arXiv id", () => {
    const parsed = parseHfPaper(
      {
        id: "2504.19413v1",
        title: "Mem0",
        summary: "A memory paper.",
        submittedOnDailyAt: "2025-04-29T00:00:00.000Z",
        upvotes: 71,
        githubRepo: "https://github.com/mem0ai/mem0",
        organization: { fullname: "Mem0" },
      },
      { title: "Mem0" }
    );
    expect(parsed).toMatchObject({
      arxivId: "2504.19413",
      githubUrl: "https://github.com/mem0ai/mem0",
      institution: "Mem0",
      upvotes: 71,
    });
  });
});

describe("recency window helper", () => {
  it("uses 7-day default and rejects missing submittedOnDailyAt", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    expect(isWithinWindow("2026-08-14T00:00:00.000Z", now, 7)).toBe(true);
    expect(isWithinWindow("2026-08-01T00:00:00.000Z", now, 7)).toBe(false);
    expect(isWithinWindow("2026-08-02T00:00:00.000Z", now, 14)).toBe(true);
    expect(isWithinWindow(undefined, now, 7)).toBe(false);
  });
});
