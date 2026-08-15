import { XMLParser } from "fast-xml-parser";
import { ARXIV_ID_BATCH, RESEARCH_PAPER_USER_AGENT } from "@/lib/live/research-paper/config";
import { stripArxivVersion } from "@/lib/live/research-paper/identity";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => ["entry", "author", "category"].includes(name),
});

export type ArxivCanonical = {
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  publishedAt: string;
  doi?: string;
  comment?: string;
};

function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("#text" in obj) return String(obj["#text"] ?? "");
    if ("@_title" in obj) return String(obj["@_title"] ?? "");
  }
  return "";
}

function authorsOf(entry: Record<string, unknown>): string[] {
  const authors = entry.author;
  if (!Array.isArray(authors)) return [];
  return authors
    .map((author) => textOf((author as Record<string, unknown>).name).trim())
    .filter(Boolean);
}

function categoriesOf(entry: Record<string, unknown>): string[] {
  const cats = entry.category;
  const list = Array.isArray(cats) ? cats : cats ? [cats] : [];
  return [
    ...new Set(
      list
        .map((cat) => String((cat as Record<string, string>)["@_term"] ?? ""))
        .filter(Boolean)
        .map((term) => term.replace(/^.*\//, ""))
    ),
  ];
}

export function parseArxivAtom(xml: string): ArxivCanonical[] {
  const doc = parser.parse(xml);
  const raw = doc?.feed?.entry ?? [];
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return entries.map((entry: Record<string, unknown>) => {
    const idRaw = textOf(entry.id);
    const arxivId = stripArxivVersion(idRaw.split("/abs/").pop() ?? idRaw);
    const doi = textOf(entry["arxiv:doi"]) || undefined;
    const comment = textOf(entry["arxiv:comment"]) || undefined;
    return {
      arxivId,
      title: textOf(entry.title).replace(/\s+/g, " ").trim(),
      abstract: textOf(entry.summary).replace(/\s+/g, " ").trim(),
      authors: authorsOf(entry),
      categories: categoriesOf(entry),
      publishedAt:
        textOf(entry.published) ||
        textOf(entry.updated) ||
        new Date().toISOString(),
      doi,
      comment,
    };
  });
}

export async function fetchArxivByIds(ids: string[]): Promise<ArxivCanonical[]> {
  const unique = [...new Set(ids.map(stripArxivVersion).filter(Boolean))];
  const results: ArxivCanonical[] = [];

  for (let index = 0; index < unique.length; index += ARXIV_ID_BATCH) {
    const batch = unique.slice(index, index + ARXIV_ID_BATCH);
    const url =
      "https://export.arxiv.org/api/query?" +
      new URLSearchParams({
        id_list: batch.join(","),
        max_results: String(batch.length),
      });
    const response = await fetch(url, {
      headers: {
        Accept: "application/atom+xml",
        "User-Agent": RESEARCH_PAPER_USER_AGENT,
      },
      next: { revalidate: 1800 },
    });
    if (!response.ok) {
      throw new Error(`arXiv id_list fetch failed: ${response.status}`);
    }
    results.push(...parseArxivAtom(await response.text()));
  }

  return results;
}
