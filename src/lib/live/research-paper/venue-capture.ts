import {
  RESEARCH_PAPER_USER_AGENT,
  VENUE_DBLP_LIMIT,
  VENUE_OPENALEX_PER_PAGE,
} from "@/lib/live/research-paper/config";
import type { HfCaptureRecord } from "@/lib/live/research-paper/hf";
import { stripArxivVersion } from "@/lib/live/research-paper/identity";
import { matchTaxonomy } from "@/lib/live/research-paper/taxonomy";
import {
  monitoredVenues,
  type VenueConfig,
} from "@/lib/live/research-paper/venues";

export type VenueFilterRecord = {
  title: string;
  venue: string;
  topic?: string;
  reason: "taxonomy-mismatch" | "taxonomy-background" | "candidate-venue";
  arxivId?: string;
  doi?: string;
  capturedAt: string;
};

function fromDate(now: Date, windowDays: number): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - windowDays);
  return date.toISOString().slice(0, 10);
}

function isHciVenue(venue: VenueConfig): boolean {
  return ["chi", "uist", "cscw", "tochi", "hci-journal", "ijhcs"].includes(
    venue.id
  );
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

function arxivFromIds(ids?: { arxiv?: string } | null, extra?: string): string {
  const raw = `${ids?.arxiv || ""} ${extra || ""}`;
  const match = raw.match(/(?:arxiv\.org\/abs\/|arxiv:)(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return match ? stripArxivVersion(match[1]) : "";
}

function doiOf(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/^https?:\/\/doi\.org\//i, "").trim() || undefined;
}

function classifyVenuePaper(
  venue: VenueConfig,
  title: string,
  abstract: string
): { capture: boolean; topic?: string; reason?: VenueFilterRecord["reason"] } {
  const match = matchTaxonomy(title, abstract, { hciVenue: isHciVenue(venue) });
  const topic = match.userFacing[0] || match.background[0];
  if (match.capture) return { capture: true, topic };
  if (match.background.length > 0 && match.userFacing.length === 0) {
    return { capture: false, topic, reason: "taxonomy-background" };
  }
  return { capture: false, topic, reason: "taxonomy-mismatch" };
}

async function fetchText(
  url: string,
  timeoutMs: number,
  accept: string
): Promise<{ status: number; text: string }> {
  const userAgent = url.includes("openalex.org")
    ? `${RESEARCH_PAPER_USER_AGENT} mailto:research-paper@localhost`
    : RESEARCH_PAPER_USER_AGENT;
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": userAgent,
    },
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, text: await response.text() };
}

async function fetchJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { status, text } = await fetchText(url, timeoutMs, "application/json");
    if (status === 429) {
      lastError = new Error(`Venue fetch failed: 429 ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    if (status < 200 || status >= 300) {
      throw new Error(`Venue fetch failed: ${status} ${url}`);
    }
    return JSON.parse(text);
  }
  throw lastError ?? new Error(`Venue fetch failed: 429 ${url}`);
}

function toCapture(
  venue: VenueConfig,
  input: {
    title: string;
    abstract: string;
    authors: string[];
    publishedAt: string;
    arxivId?: string;
    doi?: string;
    url?: string;
    source: HfCaptureRecord["captureSource"];
    topic?: string;
  }
): HfCaptureRecord {
  return {
    arxivId: input.arxivId || "",
    title: input.title,
    abstract: input.abstract,
    authors: input.authors,
    publishedAt: input.publishedAt,
    hfSubmittedAt: input.publishedAt,
    doi: input.doi,
    venue: venue.name,
    venueTier: venue.tier === "candidate" ? undefined : venue.tier,
    captureSource: input.source,
    url: input.url,
    topic: input.topic,
  };
}

type OpenAlexWork = {
  display_name?: string;
  publication_date?: string;
  doi?: string;
  ids?: { arxiv?: string; doi?: string };
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: {
    landing_page_url?: string;
    source?: { id?: string; display_name?: string; type?: string };
  };
};

async function fetchOpenAlexVenue(
  venue: VenueConfig,
  now: Date,
  windowDays: number
): Promise<{ captured: HfCaptureRecord[]; filtered: VenueFilterRecord[] }> {
  if (!venue.openAlexSourceId) return { captured: [], filtered: [] };
  const params = new URLSearchParams({
    filter: [
      `from_publication_date:${fromDate(now, windowDays)}`,
      `primary_location.source.id:${venue.openAlexSourceId}`,
    ].join(","),
    per_page: String(
      venue.tier === "B" ? Math.min(25, VENUE_OPENALEX_PER_PAGE) : VENUE_OPENALEX_PER_PAGE
    ),
    select:
      "id,doi,display_name,publication_date,ids,abstract_inverted_index,authorships,primary_location",
  });
  if (venue.mixedDomain) params.set("search", "artificial intelligence");
  const payload = (await fetchJson(
    `https://api.openalex.org/works?${params.toString()}`
  )) as { results?: OpenAlexWork[] };

  const captured: HfCaptureRecord[] = [];
  const filtered: VenueFilterRecord[] = [];
  for (const work of payload.results ?? []) {
    const title = (work.display_name || "").replace(/\s+/g, " ").trim();
    const abstract = reconstructAbstract(work.abstract_inverted_index);
    const decision = classifyVenuePaper(venue, title, abstract);
    const doi = doiOf(work.doi || work.ids?.doi);
    const arxivId = arxivFromIds(work.ids);
    if (!decision.capture) {
      filtered.push({
        title,
        venue: venue.name,
        topic: decision.topic,
        reason: decision.reason ?? "taxonomy-mismatch",
        arxivId: arxivId || undefined,
        doi,
        capturedAt: new Date().toISOString(),
      });
      continue;
    }
    captured.push(
      toCapture(venue, {
        title,
        abstract,
        authors:
          work.authorships
            ?.map((item) => item.author?.display_name?.trim() ?? "")
            .filter(Boolean) ?? [],
        publishedAt: work.publication_date
          ? `${work.publication_date}T00:00:00.000Z`
          : now.toISOString(),
        arxivId,
        doi,
        url:
          work.primary_location?.landing_page_url ||
          (doi ? `https://doi.org/${doi}` : undefined),
        source: "openalex",
        topic: decision.topic,
      })
    );
  }
  return { captured, filtered };
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function dblpConfKey(venue: VenueConfig): string {
  return (venue.dblpStream || "").replace(/^streams\/conf\//, "");
}

function dblpTocUrls(venue: VenueConfig, year: number): string[] {
  const key = dblpConfKey(venue);
  if (!key) return [];
  const files =
    key === "nips" ? [`nips${year}`, `neurips${year}`] : [`${key}${year}`];
  return files.map((file) => `https://dblp.org/db/conf/${key}/${file}.xml`);
}

export function parseDblpTocXml(xml: string): Array<{
  title: string;
  authors: string[];
  doi?: string;
  arxivId: string;
  url?: string;
}> {
  const records: Array<{
    title: string;
    authors: string[];
    doi?: string;
    arxivId: string;
    url?: string;
  }> = [];
  const blocks = xml.matchAll(
    /<(inproceedings|incollection|article)\b[^>]*>([\s\S]*?)<\/\1>/gi
  );
  for (const match of blocks) {
    const body = match[2];
    const title = decodeXml(
      (body.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ""
    );
    if (!title || /^proceedings of\b/i.test(title)) continue;
    const authors = [...body.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi)]
      .map((item) => decodeXml(item[1]))
      .filter(Boolean);
    const ees = [...body.matchAll(/<ee\b[^>]*>([\s\S]*?)<\/ee>/gi)].map((item) =>
      decodeXml(item[1])
    );
    const doiRaw =
      (body.match(/<doi>([\s\S]*?)<\/doi>/i) || [])[1] ||
      ees.find((ee) => /doi\.org\//i.test(ee));
    records.push({
      title,
      authors,
      doi: doiOf(doiRaw),
      arxivId: arxivFromIds(undefined, ees.join(" ")),
      url: ees[0],
    });
  }
  return records;
}

async function fetchDblpVenue(
  venue: VenueConfig,
  now: Date
): Promise<{ captured: HfCaptureRecord[]; filtered: VenueFilterRecord[] }> {
  if (!venue.dblpStream) return { captured: [], filtered: [] };
  const year = now.getUTCFullYear();
  let xml = "";
  for (const url of dblpTocUrls(venue, year)) {
    const { status, text } = await fetchText(url, 25_000, "application/xml");
    if (status === 404) continue;
    if (status === 429) throw new Error(`DBLP TOC 429 ${url}`);
    if (status < 200 || status >= 300) {
      throw new Error(`DBLP TOC failed: ${status} ${url}`);
    }
    if (!text.includes("<title")) continue;
    xml = text;
    break;
  }
  if (!xml) return { captured: [], filtered: [] };

  const captured: HfCaptureRecord[] = [];
  const filtered: VenueFilterRecord[] = [];
  const limit = venue.tier === "B" ? 25 : VENUE_DBLP_LIMIT;
  for (const paper of parseDblpTocXml(xml)) {
    if (captured.length >= limit) break;
    const decision = classifyVenuePaper(venue, paper.title, "");
    if (!decision.capture) {
      if (filtered.length < 12) {
        filtered.push({
          title: paper.title,
          venue: venue.name,
          topic: decision.topic,
          reason: decision.reason ?? "taxonomy-mismatch",
          arxivId: paper.arxivId || undefined,
          doi: paper.doi,
          capturedAt: new Date().toISOString(),
        });
      }
      continue;
    }
    captured.push(
      toCapture(venue, {
        title: paper.title,
        abstract: "",
        authors: paper.authors,
        publishedAt: now.toISOString(),
        arxivId: paper.arxivId,
        doi: paper.doi,
        url: paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : undefined),
        source: "dblp",
        topic: decision.topic,
      })
    );
  }
  return { captured, filtered };
}

const OPENALEX_CONFERENCE: Record<
  string,
  {
    sourceId?: string;
    search?: string;
    sourcePattern: RegExp;
    allowMissingSource?: boolean;
  }
> = {
  aaai: {
    sourceId: "S4210191458",
    sourcePattern: /AAAI Conference on Artificial Intelligence/i,
  },
  chi: {
    search: "CHI Conference on Human Factors",
    sourcePattern: /CHI Conference on Human Factors|\bCHI EA\b/i,
    allowMissingSource: true,
  },
  uist: {
    search: "User Interface Software and Technology",
    sourcePattern: /User Interface Software/i,
    allowMissingSource: true,
  },
  cscw: {
    search: "CSCW",
    sourcePattern: /Computer-Supported Cooperative Work|\bCSCW\b/i,
  },
  icml: {
    search: '"International Conference on Machine Learning"',
    sourcePattern: /International Conference on Machine Learning|\bICML\b/i,
  },
  neurips: {
    search: '"Neural Information Processing Systems"',
    sourcePattern: /Neural Information Processing Systems|\bNeurIPS\b/i,
  },
  iclr: {
    search: '"International Conference on Learning Representations"',
    sourcePattern: /International Conference on Learning Representations|\bICLR\b/i,
  },
  acl: {
    search: "Annual Meeting of the Association for Computational Linguistics",
    sourcePattern: /Association for Computational Linguistics/i,
  },
  emnlp: {
    search: "Empirical Methods in Natural Language Processing",
    sourcePattern: /Empirical Methods in Natural Language Processing|\bEMNLP\b/i,
  },
  cvpr: {
    search: "Conference on Computer Vision and Pattern Recognition",
    sourcePattern: /Computer Vision and Pattern Recognition|\bCVPR\b/i,
  },
  iccv: {
    search: "International Conference on Computer Vision",
    sourcePattern: /International Conference on Computer Vision|\bICCV\b/i,
  },
  eccv: {
    search: "European Conference on Computer Vision",
    sourcePattern: /European Conference on Computer Vision|\bECCV\b/i,
  },
  rss: {
    search: "Robotics: Science and Systems",
    sourcePattern: /Robotics: Science and Systems/i,
  },
  ijcai: {
    search: "International Joint Conference on Artificial Intelligence",
    sourcePattern: /International Joint Conference on Artificial Intelligence|\bIJCAI\b/i,
  },
  icra: {
    search: "International Conference on Robotics and Automation",
    sourcePattern: /International Conference on Robotics and Automation|\bICRA\b/i,
  },
};

async function fetchOpenAlexConference(
  venue: VenueConfig,
  now: Date
): Promise<{ captured: HfCaptureRecord[]; filtered: VenueFilterRecord[] }> {
  const spec = OPENALEX_CONFERENCE[venue.id];
  if (!spec) return { captured: [], filtered: [] };
  const year = now.getUTCFullYear();
  const limit = venue.tier === "B" ? 25 : VENUE_OPENALEX_PER_PAGE;
  const params = new URLSearchParams({
    filter: [
      `publication_year:${year}`,
      "type:types/conference-paper",
      spec.sourceId ? `primary_location.source.id:${spec.sourceId}` : "",
    ]
      .filter(Boolean)
      .join(","),
    per_page: String(limit),
    select:
      "id,doi,display_name,publication_date,ids,abstract_inverted_index,authorships,primary_location",
  });
  if (spec.search && !spec.sourceId) params.set("search", spec.search);
  const payload = (await fetchJson(
    `https://api.openalex.org/works?${params.toString()}`
  )) as { results?: OpenAlexWork[] };

  const captured: HfCaptureRecord[] = [];
  const filtered: VenueFilterRecord[] = [];
  for (const work of payload.results ?? []) {
    const sourceName = work.primary_location?.source?.display_name || "";
    if (sourceName && !spec.sourcePattern.test(sourceName)) continue;
    if (!sourceName && !spec.allowMissingSource) continue;
    const title = (work.display_name || "").replace(/\s+/g, " ").trim();
    const abstract = reconstructAbstract(work.abstract_inverted_index);
    const decision = classifyVenuePaper(venue, title, abstract);
    const doi = doiOf(work.doi || work.ids?.doi);
    const arxivId = arxivFromIds(work.ids);
    if (!decision.capture) {
      filtered.push({
        title,
        venue: venue.name,
        topic: decision.topic,
        reason: decision.reason ?? "taxonomy-mismatch",
        arxivId: arxivId || undefined,
        doi,
        capturedAt: new Date().toISOString(),
      });
      continue;
    }
    captured.push(
      toCapture(venue, {
        title,
        abstract,
        authors:
          work.authorships
            ?.map((item) => item.author?.display_name?.trim() ?? "")
            .filter(Boolean) ?? [],
        publishedAt: now.toISOString(),
        arxivId,
        doi,
        url:
          work.primary_location?.landing_page_url ||
          (doi ? `https://doi.org/${doi}` : undefined),
        source: "openalex",
        topic: decision.topic,
      })
    );
  }
  return { captured, filtered };
}

async function fetchAnthology(
  now: Date,
  windowDays: number
): Promise<{ captured: HfCaptureRecord[]; filtered: VenueFilterRecord[] }> {
  const venues = monitoredVenues().filter((venue) => venue.anthologyPattern);
  if (venues.length === 0) return { captured: [], filtered: [] };
  const response = await fetch("https://aclanthology.org/papers/index.xml", {
    headers: { "User-Agent": RESEARCH_PAPER_USER_AGENT, Accept: "application/xml" },
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Anthology RSS failed: ${response.status}`);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  const captured: HfCaptureRecord[] = [];
  const filtered: VenueFilterRecord[] = [];
  for (const item of items) {
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
      ?.replace(/\s+/g, " ")
      .trim();
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]?.trim();
    const description = (item.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
    const pubDate = (item.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1];
    if (!title || !pubDate) continue;
    const published = new Date(pubDate);
    if (Number.isNaN(published.getTime())) continue;
    if (now.getTime() - published.getTime() > windowDays * 24 * 60 * 60 * 1000) continue;
    const venue = venues.find((candidate) =>
      candidate.anthologyPattern?.test(`${title} ${description}`)
    );
    if (!venue) continue;
    if (/\bnaacl\b/i.test(description)) continue;
    const decision = classifyVenuePaper(venue, title, description);
    if (!decision.capture) {
      filtered.push({
        title,
        venue: venue.name,
        topic: decision.topic,
        reason: decision.reason ?? "taxonomy-mismatch",
        capturedAt: new Date().toISOString(),
      });
      continue;
    }
    captured.push(
      toCapture(venue, {
        title,
        abstract: description.replace(/\s+/g, " ").trim(),
        authors: [],
        publishedAt: published.toISOString(),
        url: link,
        source: "anthology",
        topic: decision.topic,
      })
    );
  }
  return { captured, filtered };
}

export async function fetchVenueCandidates(options?: {
  now?: Date;
  windowDays?: number;
}): Promise<{
  captured: HfCaptureRecord[];
  filtered: VenueFilterRecord[];
  errors: string[];
}> {
  const now = options?.now ?? new Date();
  const windowDays = options?.windowDays ?? 7;
  const captured: HfCaptureRecord[] = [];
  const filtered: VenueFilterRecord[] = [];
  const errors: string[] = [];

  const journals = monitoredVenues().filter((venue) => venue.openAlexSourceId);
  const conferences = monitoredVenues().filter(
    (venue) => venue.dblpStream && !venue.openAlexSourceId
  );

  for (const venue of journals) {
    try {
      const result = await fetchOpenAlexVenue(venue, now, windowDays);
      captured.push(...result.captured);
      filtered.push(...result.filtered);
    } catch (error) {
      errors.push(`${venue.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const openAlexConferenceBudget = new Set([
    "chi",
    "aaai",
    "uist",
    "acl",
    "icml",
  ]);
  let dblpUnavailable = false;
  for (const venue of conferences) {
    try {
      let result: { captured: HfCaptureRecord[]; filtered: VenueFilterRecord[] } = {
        captured: [],
        filtered: [],
      };
      if (!dblpUnavailable) {
        try {
          result = await fetchDblpVenue(venue, now);
        } catch {
          dblpUnavailable = true;
        }
      }
      if (
        result.captured.length === 0 &&
        result.filtered.length === 0 &&
        openAlexConferenceBudget.has(venue.id)
      ) {
        result = await fetchOpenAlexConference(venue, now);
      }
      captured.push(...result.captured);
      filtered.push(...result.filtered);
    } catch (error) {
      errors.push(`${venue.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const anthology = await fetchAnthology(now, windowDays);
    captured.push(...anthology.captured);
    filtered.push(...anthology.filtered);
  } catch (error) {
    errors.push(`anthology: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { captured, filtered, errors };
}
