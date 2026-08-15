import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RESEARCH_PAPER_USER_AGENT } from "@/lib/live/research-paper/config";
import { qualifyResearchPaper } from "@/lib/live/research-paper/gate";
import { fetchHfDailyPapers } from "@/lib/live/research-paper/hf";
import { normalizeTitle } from "@/lib/live/research-paper/identity";
import { matchTaxonomy } from "@/lib/live/research-paper/taxonomy";
import { parseDblpTocXml } from "@/lib/live/research-paper/venue-capture";

const live = process.env.LIVE_SMOKE === "1";

type Row = {
  venue: string;
  source: string;
  year: string;
  title: string;
  doi?: string;
  arxivId?: string;
  duplicateHf: boolean;
  reason?: string;
  cue?: string;
  state: "PUBLISH" | "WATCH" | "REVIEW QUEUE";
};

type Summary = {
  venue: string;
  source: string;
  year: string;
  fetched: number;
  taxonomy: number;
  nonHf: number;
  publish: number;
  watch: number;
  queue: number;
  first40Watch: number;
  error?: string;
};

function stateOf(
  decision: ReturnType<typeof qualifyResearchPaper>
): Row["state"] {
  if (decision.publish) return "PUBLISH";
  if (decision.passCandidate) return "WATCH";
  return "REVIEW QUEUE";
}

async function getText(
  url: string,
  timeoutMs = 25_000
): Promise<{ status: number; text: string }> {
  const openAlex = url.includes("openalex.org");
  const response = await fetch(url, {
    headers: {
      Accept: openAlex ? "application/json" : "application/xml",
      "User-Agent": openAlex
        ? `${RESEARCH_PAPER_USER_AGENT} mailto:research-paper@localhost`
        : RESEARCH_PAPER_USER_AGENT,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, text: await response.text() };
}

function tocCachePath(key: string, year: number): string {
  return path.join(process.cwd(), ".cache/dblp-toc", `${key}${year}.xml`);
}

async function fetchToc(
  key: string,
  year: number,
  liveFetch: boolean
): Promise<{
  year: number;
  records: ReturnType<typeof parseDblpTocXml>;
  error?: string;
}> {
  const cachePath = tocCachePath(key, year);
  try {
    const cached = await readFile(cachePath, "utf8");
    if (cached.includes("<title")) {
      return { year, records: parseDblpTocXml(cached) };
    }
  } catch {
    // Live fetch below when allowed.
  }
  if (!liveFetch) {
    return { year, records: [] };
  }
  const url = `https://dblp.org/db/conf/${key}/${key}${year}.xml`;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
      }
      const { status, text } = await getText(url, 40_000);
      if (status === 404) return { year, records: [] };
      if (status === 429) {
        lastError = "HTTP 429";
        continue;
      }
      if (status !== 200) return { year, records: [], error: `HTTP ${status}` };
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, text);
      return { year, records: parseDblpTocXml(text) };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { year, records: [], error: lastError };
}

function reconstructAbstract(
  inverted?: Record<string, number[]> | null
): string {
  if (!inverted) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const position of positions) words[position] = word;
  }
  return words.filter(Boolean).join(" ");
}

function isHfDuplicate(
  title: string,
  arxivId: string | undefined,
  hfIds: Set<string>,
  hfTitles: Set<string>
): boolean {
  return Boolean(arxivId && hfIds.has(arxivId)) || hfTitles.has(normalizeTitle(title));
}

describe.skipIf(!live)("Research Paper V1.1 venue recall validation", () => {
  it("finds non-HF venue candidates that naturally reach Watch or Publish", async () => {
    const hf = await fetchHfDailyPapers({ now: new Date(), windowDays: 7 });
    const hfIds = new Set(hf.map((row) => row.arxivId).filter(Boolean));
    const hfTitles = new Set(hf.map((row) => normalizeTitle(row.title)));

    const probes: Array<{
      venue: string;
      key: string;
      years: number[];
      hci?: boolean;
    }> = [
      { venue: "CHI", key: "chi", years: [2026], hci: true },
      { venue: "UIST", key: "uist", years: [2026, 2025], hci: true },
      { venue: "ACL", key: "acl", years: [2026, 2025] },
      { venue: "EMNLP", key: "emnlp", years: [2026, 2025] },
      { venue: "CVPR", key: "cvpr", years: [2026, 2025] },
      { venue: "ICCV", key: "iccv", years: [2026, 2025] },
      { venue: "ECCV", key: "eccv", years: [2026, 2025, 2024] },
    ];

    const summaries: Summary[] = [];
    const examples: Row[] = [];

    for (const probe of probes) {
      const productionYear = new Date().getUTCFullYear();
      let toc: Awaited<ReturnType<typeof fetchToc>> | undefined;
      for (const year of probe.years) {
        toc = await fetchToc(probe.key, year, false);
        if (toc.records.length > 0) break;
      }
      if (!toc?.records.length && probe.key === "chi") {
        toc = await fetchToc(probe.key, probe.years[0], true);
      }
      if (!toc) continue;
      const yearLabel =
        toc.year === productionYear
          ? String(toc.year)
          : `${toc.year} (recall validation)`;
      const taxonomyHits = toc.records.filter((paper) =>
        matchTaxonomy(paper.title, "", { hciVenue: probe.hci }).capture
      );
      let publish = 0;
      let watch = 0;
      let queue = 0;
      let nonHf = 0;
      let first40Watch = 0;
      const venueRows: Row[] = [];
      taxonomyHits.forEach((paper, index) => {
        const decision = qualifyResearchPaper(paper.title, "");
        const duplicateHf = isHfDuplicate(
          paper.title,
          paper.arxivId || undefined,
          hfIds,
          hfTitles
        );
        if (!duplicateHf) nonHf += 1;
        if (decision.publish) publish += 1;
        else if (decision.passCandidate) {
          watch += 1;
          if (index < 40) first40Watch += 1;
        } else queue += 1;
        venueRows.push({
          venue: probe.venue,
          source: "dblp-toc",
          year: yearLabel,
          title: paper.title,
          doi: paper.doi,
          arxivId: paper.arxivId || undefined,
          duplicateHf,
          reason: decision.reason,
          cue: decision.cue,
          state: stateOf(decision),
        });
      });
      summaries.push({
        venue: probe.venue,
        source: "dblp-toc",
        year: yearLabel,
        fetched: toc.records.length,
        taxonomy: taxonomyHits.length,
        nonHf,
        publish,
        watch,
        queue,
        first40Watch,
        error: toc.error,
      });
      const rejected = venueRows.find(
        (row) => row.state === "REVIEW QUEUE" && !row.duplicateHf
      );
      const useful = venueRows.find(
        (row) =>
          !row.duplicateHf &&
          (row.state === "PUBLISH" || row.state === "WATCH")
      );
      if (rejected) examples.push(rejected);
      if (useful) examples.push(useful);
    }

    const nmiParams = new URLSearchParams({
      filter:
        "from_publication_date:2026-01-01,primary_location.source.id:S2912241403",
      per_page: "25",
      select:
        "display_name,publication_date,doi,ids,abstract_inverted_index,primary_location",
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const { status, text } = await getText(
        `https://api.openalex.org/works?${nmiParams}`,
        15_000
      );
      if (status === 200) {
        const payload = JSON.parse(text) as {
          results?: Array<{
            display_name?: string;
            publication_date?: string;
            doi?: string;
            ids?: { arxiv?: string };
            abstract_inverted_index?: Record<string, number[]>;
          }>;
        };
        let taxonomy = 0;
        let nonHf = 0;
        let publish = 0;
        let watch = 0;
        let queue = 0;
        for (const work of payload.results ?? []) {
          const title = work.display_name || "";
          const abstract = reconstructAbstract(work.abstract_inverted_index);
          if (!matchTaxonomy(title, abstract).capture) continue;
          taxonomy += 1;
          const arxivId = (work.ids?.arxiv || "").replace(
            /^https?:\/\/arxiv.org\/abs\//i,
            ""
          );
          const duplicateHf = isHfDuplicate(title, arxivId || undefined, hfIds, hfTitles);
          if (!duplicateHf) nonHf += 1;
          const decision = qualifyResearchPaper(title, abstract);
          if (decision.publish) publish += 1;
          else if (decision.passCandidate) watch += 1;
          else queue += 1;
          examples.push({
            venue: "Nature Machine Intelligence",
            source: "openalex",
            year: work.publication_date || "2026",
            title,
            doi: work.doi,
            arxivId: arxivId || undefined,
            duplicateHf,
            reason: decision.reason,
            cue: decision.cue,
            state: stateOf(decision),
          });
        }
        summaries.push({
          venue: "Nature Machine Intelligence",
          source: "openalex",
          year: "2026-01-01+",
          fetched: payload.results?.length ?? 0,
          taxonomy,
          nonHf,
          publish,
          watch,
          queue,
          first40Watch: watch,
        });
      } else {
        summaries.push({
          venue: "Nature Machine Intelligence",
          source: "openalex",
          year: "2026-01-01+",
          fetched: 0,
          taxonomy: 0,
          nonHf: 0,
          publish: 0,
          watch: 0,
          queue: 0,
          first40Watch: 0,
          error: `HTTP ${status}`,
        });
      }
    } catch (error) {
      summaries.push({
        venue: "Nature Machine Intelligence",
        source: "openalex",
        year: "2026-01-01+",
        fetched: 0,
        taxonomy: 0,
        nonHf: 0,
        publish: 0,
        watch: 0,
        queue: 0,
        first40Watch: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const anth = await getText(
      "https://aclanthology.org/papers/index.xml",
      20_000
    );
    if (anth.status === 200) {
      const items = [...anth.text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
        (match) => match[1]
      );
      const now = Date.now();
      let fetched = 0;
      let taxonomy = 0;
      let nonHf = 0;
      let publish = 0;
      let watch = 0;
      let queue = 0;
      for (const item of items) {
        const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
          ?.replace(/\s+/g, " ")
          .trim();
        const description =
          (item.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
        const pubDate = (item.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1];
        if (!title || !pubDate) continue;
        const published = new Date(pubDate);
        if (Number.isNaN(published.getTime())) continue;
        if (now - published.getTime() > 14 * 24 * 60 * 60 * 1000) continue;
        const hay = `${title} ${description}`;
        const venue = /empirical methods in natural language processing|\bemnlp\b/i.test(
          hay
        )
          ? "EMNLP"
          : /annual meeting of the association for computational linguistics|\bacl\b/i.test(
                hay
              )
            ? "ACL"
            : null;
        if (!venue || /\bnaacl\b/i.test(description)) continue;
        fetched += 1;
        if (!matchTaxonomy(title, description).capture) continue;
        taxonomy += 1;
        const duplicateHf = hfTitles.has(normalizeTitle(title));
        if (!duplicateHf) nonHf += 1;
        const decision = qualifyResearchPaper(title, description);
        if (decision.publish) publish += 1;
        else if (decision.passCandidate) watch += 1;
        else queue += 1;
        examples.push({
          venue,
          source: "anthology",
          year: published.toISOString().slice(0, 10),
          title,
          duplicateHf,
          reason: decision.reason,
          cue: decision.cue,
          state: stateOf(decision),
        });
      }
      summaries.push({
        venue: "ACL/EMNLP",
        source: "anthology",
        year: "RSS last 14d",
        fetched,
        taxonomy,
        nonHf,
        publish,
        watch,
        queue,
        first40Watch: watch,
      });
    }

    const nonHfUseful = examples.filter(
      (row) =>
        !row.duplicateHf && (row.state === "PUBLISH" || row.state === "WATCH")
    );
    const nonHfRejected = examples.filter(
      (row) => !row.duplicateHf && row.state === "REVIEW QUEUE"
    );
    const chi = summaries.find((row) => row.venue === "CHI");

    const report = {
      hfCount: hf.length,
      summaries,
      useful: nonHfUseful.slice(0, 8),
      rejected: nonHfRejected.slice(0, 4),
    };
    console.info("V1.1 venue recall validation", report);
    await mkdir(path.join(process.cwd(), ".cache"), { recursive: true });
    await writeFile(
      path.join(process.cwd(), ".cache/venue-recall-validation.json"),
      JSON.stringify(report, null, 2)
    );

    expect(summaries.some((row) => row.taxonomy > 0 && row.nonHf > 0)).toBe(
      true
    );
    expect(nonHfRejected.length).toBeGreaterThan(0);
    expect(nonHfUseful.length).toBeGreaterThan(0);
    expect(nonHfUseful.every((row) => row.state !== "PUBLISH" || row.cue)).toBe(
      true
    );
    expect(chi?.first40Watch).toBeGreaterThan(0);
    expect(chi?.publish).toBe(0);
  }, 300_000);
});
