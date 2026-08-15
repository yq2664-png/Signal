import { describe, expect, it } from "vitest";
import { fetchArxivByIds } from "@/lib/live/research-paper/arxiv-atom";
import { fetchHfDailyPapers, fetchHfPaper } from "@/lib/live/research-paper/hf";
import {
  fetchResearchPaperFeedItems,
  fetchVenueCandidates,
  candidateVenues,
  qualifyResearchPaper,
} from "@/lib/live/research-paper";

const live = process.env.LIVE_SMOKE === "1";

describe.skipIf(!live)("Research Paper V1 live smoke", () => {
  it("fetches HF Daily Papers and hydrates arXiv canonical metadata", async () => {
    const captured = await fetchHfDailyPapers({
      now: new Date(),
      windowDays: 7,
    });
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]?.arxivId).toMatch(/^\d{4}\.\d{4,5}$/);

    const canonical = await fetchArxivByIds(
      captured.slice(0, 5).map((paper) => paper.arxivId)
    );
    expect(canonical.length).toBeGreaterThan(0);
    expect(canonical[0]?.abstract.length).toBeGreaterThan(40);
    expect(canonical[0]?.authors.length).toBeGreaterThan(0);

    const detail = await fetchHfPaper(captured[0].arxivId);
    expect(detail?.arxivId).toBe(captured[0].arxivId);
  }, 30_000);
});

describe.skipIf(!live)("Research Paper V1.1 live capture", () => {
  it("fetches trusted venues without emptying the HF path", async () => {
    const venue = await fetchVenueCandidates({ now: new Date(), windowDays: 7 });
    const conferenceCaptured = venue.captured.filter(
      (row) =>
        row.captureSource === "dblp" ||
        (row.captureSource === "openalex" &&
          row.venue !== undefined &&
          ![
            "Nature",
            "Science",
            "Nature Human Behaviour",
            "Nature Machine Intelligence",
            "TOCHI",
            "TPAMI",
            "Human–Computer Interaction",
            "IJHCS",
          ].includes(row.venue))
    );
    const byVenue = new Map<string, number>();
    for (const row of venue.captured) {
      const key = `${row.venue || "unknown"}/${row.captureSource || "unknown"}`;
      byVenue.set(key, (byVenue.get(key) ?? 0) + 1);
    }
    const gated = conferenceCaptured.map((row) => ({
      title: row.title,
      venue: row.venue,
      decision: qualifyResearchPaper(row.title, row.abstract),
    }));
    console.info("V1.1 live capture", {
      venueCaptured: venue.captured.length,
      venueFiltered: venue.filtered.length,
      dblpCaptured: venue.captured.filter((row) => row.captureSource === "dblp")
        .length,
      conferenceCaptured: conferenceCaptured.length,
      byVenue: Object.fromEntries(byVenue),
      venueErrors: venue.errors,
      venueSamples: venue.captured.slice(0, 12).map((row) => ({
        title: row.title,
        venue: row.venue,
        source: row.captureSource,
        arxivId: row.arxivId || undefined,
        doi: row.doi,
      })),
      gateRejects: gated.filter((row) => !row.decision.publish).length,
      gatePublishes: gated.filter((row) => row.decision.publish).length,
    });
    expect(
      venue.captured.every((row) => row.venueTier === "A" || row.venueTier === "B")
    ).toBe(true);
    expect(
      venue.captured.every(
        (row) =>
          !candidateVenues().some((candidate) => candidate.name === row.venue)
      )
    ).toBe(true);
    expect(conferenceCaptured.length).toBeGreaterThanOrEqual(3);
    expect(gated.some((row) => !row.decision.publish)).toBe(true);
  }, 180_000);
});

describe.skipIf(!live)("Research Paper V1 publication cap", () => {
  it("publishes at most 6 PASS cards through the live pipeline", async () => {
    const result = await fetchResearchPaperFeedItems({
      persistDiagnostics: false,
    });
    const fatal = result.errors.filter(
      (error) => !error.startsWith("venue:") && !error.startsWith("anthology:")
    );
    expect(fatal).toEqual([]);
    expect(result.data.length).toBeLessThanOrEqual(6);
    const ids = result.data.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of result.data) {
      expect(item.category).toBe("Research Papers");
      expect(item.brief.whatHappened).not.toMatch(/arXiv published an update/i);
      expect(item.tags).toContain("research-paper");
    }
  }, 180_000);
});
