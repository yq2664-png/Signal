import { mkdir, readFile, writeFile, rename } from "fs/promises";
import path from "path";
import { getCacheDir } from "../cache-dir";
import { stripHtml } from "../normalize";
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
      publishedAt: textOf(entry.published),
      doi,
      comment,
    };
  });
}

export function parseArxivPage(html: string, expectedId: string): ArxivCanonical | undefined {
  const meta = new Map<string, string[]>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1].toLowerCase(), m[3]]));
    const key = attrs.name || attrs.property;
    if (key && attrs.content) meta.set(key, [...(meta.get(key) ?? []), stripHtml(attrs.content)]);
  }
  const value = (key: string) => meta.get(key)?.[0] ?? "";
  const id = stripArxivVersion(value("citation_arxiv_id"));
  const title = value("citation_title"), abstract = value("citation_abstract") || value("og:description");
  const date = value("citation_date").replaceAll("/", "-");
  if (id !== expectedId || !title || abstract.length < 80 || !Number.isFinite(Date.parse(date))) return;
  const categories = [...new Set([...html.matchAll(/\b(cs\.[A-Z]{2}|stat\.ML)\b/g)].map(m => m[1]))];
  return { arxivId: id, title, abstract, authors: meta.get("citation_author") ?? [], categories, publishedAt: new Date(date).toISOString(), doi: value("citation_doi") || undefined };
}

export async function fetchArxivByIds(ids: string[]): Promise<ArxivCanonical[]> {
  const unique = [...new Set(ids.map(stripArxivVersion).filter(id => /^\d{4}\.\d{4,5}$/.test(id)))];
  const file = path.join(getCacheDir(), "arxiv-canonical.json");
  let cache: Record<string, ArxivCanonical> = {};
  try { const parsed = JSON.parse(await readFile(file, "utf8")); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) cache = parsed; } catch { /* Cold start. */ }
  const results = new Map<string, ArxivCanonical>();
  for (const id of unique) if (cache[id]?.arxivId === id && cache[id].abstract && cache[id].publishedAt) results.set(id, cache[id]);
  const missing = unique.filter(id => !results.has(id));
  for (let index = 0; index < missing.length; index += ARXIV_ID_BATCH) {
    const batch = missing.slice(index, index + ARXIV_ID_BATCH);
    try {
      const response = await fetch("https://export.arxiv.org/api/query?" + new URLSearchParams({ id_list: batch.join(","), max_results: String(batch.length) }), {
        headers: { Accept: "application/atom+xml", "User-Agent": RESEARCH_PAPER_USER_AGENT },
        signal: AbortSignal.timeout(12_000), next: { revalidate: 1800 },
      });
      if (response.status === 429 || response.status === 503) break;
      if (!response.ok) continue;
      for (const entry of parseArxivAtom(await response.text())) {
        if (batch.includes(entry.arxivId) && entry.title && entry.abstract && Number.isFinite(Date.parse(entry.publishedAt))) results.set(entry.arxivId, entry);
      }
    } catch { /* Retain successful batches and use official abstract pages. */ }
  }
  // Bounded recovery; subsequent runs advance through remaining IDs using disk cache.
  const fallback = unique.filter(id => !results.has(id)).slice(0, 20);
  for (let index = 0; index < fallback.length; index += 2) {
    await Promise.all(fallback.slice(index, index + 2).map(async id => {
      try {
        const response = await fetch(`https://arxiv.org/abs/${id}`, { signal: AbortSignal.timeout(8_000), headers: { "User-Agent": RESEARCH_PAPER_USER_AGENT }, next: { revalidate: 86400 } });
        if (!response.ok) return;
        const entry = parseArxivPage(await response.text(), id);
        if (entry) results.set(id, entry);
      } catch { /* Missing metadata never erases other papers. */ }
    }));
  }
  cache = Object.fromEntries(Object.entries({ ...cache, ...Object.fromEntries(results) }).slice(-2000));
  try {
    await mkdir(getCacheDir(), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(cache));
    await rename(temp, file);
  } catch (error) { console.error("[arxiv-cache]", error); }
  if (unique.length && !results.size) throw new Error("arXiv metadata unavailable from API, official pages and cache");
  return [...results.values()];
}
