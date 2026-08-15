import {
  DEFAULT_WINDOW_DAYS,
  HF_DAILY_LIMIT,
  RECALL_WINDOW_DAYS,
  RESEARCH_PAPER_USER_AGENT,
} from "@/lib/live/research-paper/config";
import { stripArxivVersion } from "@/lib/live/research-paper/identity";

export type HfCaptureRecord = {
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  publishedAt?: string;
  hfSubmittedAt?: string;
  institution?: string;
  githubUrl?: string;
  demoUrl?: string;
  upvotes?: number;
  stars?: number;
  doi?: string;
  venue?: string;
  venueTier?: "A" | "B";
  captureSource?: "hf" | "openalex" | "dblp" | "anthology";
  url?: string;
  topic?: string;
};

type HfPaperPayload = {
  id?: string;
  title?: string;
  summary?: string;
  publishedAt?: string;
  submittedOnDailyAt?: string;
  upvotes?: number;
  githubRepo?: string;
  githubStars?: number;
  projectPage?: string;
  authors?: Array<{ name?: string } | string>;
  organization?: { name?: string; fullname?: string };
};

type HfDailyRow = {
  title?: string;
  summary?: string;
  publishedAt?: string;
  organization?: { name?: string; fullname?: string };
  paper?: HfPaperPayload;
};

function authorsOf(paper?: HfPaperPayload): string[] {
  if (!paper?.authors) return [];
  return paper.authors
    .map((author) => (typeof author === "string" ? author : author.name ?? ""))
    .map((name) => name.trim())
    .filter(Boolean);
}

function institutionOf(
  organization?: { name?: string; fullname?: string }
): string | undefined {
  const name = organization?.fullname?.trim() || organization?.name?.trim();
  return name || undefined;
}

export function parseHfPaper(
  paper: HfPaperPayload,
  row?: HfDailyRow
): HfCaptureRecord | null {
  const arxivId = stripArxivVersion(paper.id ?? "");
  if (!arxivId) return null;
  return {
    arxivId,
    title: (paper.title || row?.title || "").replace(/\s+/g, " ").trim(),
    abstract: (paper.summary || row?.summary || "").replace(/\s+/g, " ").trim(),
    authors: authorsOf(paper),
    publishedAt: paper.publishedAt,
    hfSubmittedAt: paper.submittedOnDailyAt,
    institution:
      institutionOf(paper.organization) || institutionOf(row?.organization),
    githubUrl: paper.githubRepo,
    demoUrl: paper.projectPage,
    upvotes: paper.upvotes,
    stars: paper.githubStars,
    captureSource: "hf",
  };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function windowDates(now: Date, windowDays: number): string[] {
  const days = Math.max(1, Math.min(windowDays, RECALL_WINDOW_DAYS));
  const dates: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    dates.push(dateKey(date));
  }
  return dates;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": RESEARCH_PAPER_USER_AGENT,
    },
    next: { revalidate: 1800 },
  });
  if (!response.ok) {
    throw new Error(`Hugging Face fetch failed: ${response.status} ${url}`);
  }
  return response.json();
}

export async function fetchHfPaper(arxivId: string): Promise<HfCaptureRecord | null> {
  const payload = (await fetchJson(
    `https://huggingface.co/api/papers/${stripArxivVersion(arxivId)}`
  )) as HfPaperPayload;
  return parseHfPaper(payload);
}

export async function fetchHfDailyPapers(options?: {
  now?: Date;
  windowDays?: number;
  limit?: number;
}): Promise<HfCaptureRecord[]> {
  const now = options?.now ?? new Date();
  const windowDays = options?.windowDays ?? DEFAULT_WINDOW_DAYS;
  const limit = options?.limit ?? HF_DAILY_LIMIT;
  const records = new Map<string, HfCaptureRecord>();
  const pages = await Promise.all(
    windowDates(now, windowDays).map(async (date) => {
      const url =
        "https://huggingface.co/api/daily_papers?" +
        new URLSearchParams({ date, limit: String(limit) });
      const payload = (await fetchJson(url)) as HfDailyRow[];
      return Array.isArray(payload) ? payload : [];
    })
  );

  for (const payload of pages) {
    for (const row of payload) {
      if (!row.paper) continue;
      const parsed = parseHfPaper(row.paper, row);
      if (parsed) records.set(parsed.arxivId, parsed);
    }
  }

  return [...records.values()];
}
