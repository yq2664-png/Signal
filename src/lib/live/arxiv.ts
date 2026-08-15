import { XMLParser } from "fast-xml-parser";
import type { FeedItem } from "@/lib/types";
import { slugId, toFeedItem } from "@/lib/live/normalize";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => ["entry", "author", "category"].includes(name),
});

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

function primaryCategory(entry: Record<string, unknown>): string {
  const cats = entry.category;
  if (Array.isArray(cats) && cats.length > 0) {
    const term = (cats[0] as Record<string, string>)["@_term"];
    if (term) return term.replace(/^.*\//, "");
  } else if (cats && typeof cats === "object") {
    const term = (cats as Record<string, string>)["@_term"];
    if (term) return term.replace(/^.*\//, "");
  }
  return "cs.AI";
}

function authorsOf(entry: Record<string, unknown>): string[] {
  const authors = entry.author;
  if (!Array.isArray(authors)) return [];
  return authors
    .map((a) => textOf((a as Record<string, unknown>).name))
    .filter(Boolean)
    .slice(0, 4);
}

/** @deprecated Live Research Papers path is fetchResearchPaperFeedItems. Kept for reference only. */
export async function fetchArxiv(limit = 12): Promise<FeedItem[]> {
  const url =
    "https://export.arxiv.org/api/query?" +
    new URLSearchParams({
      search_query: "cat:cs.AI OR cat:cs.LG OR cat:cs.CL",
      start: "0",
      max_results: String(limit),
      sortBy: "submittedDate",
      sortOrder: "descending",
    });

  const res = await fetch(url, {
    next: { revalidate: 1800 },
    headers: { Accept: "application/atom+xml" },
  });
  if (!res.ok) throw new Error(`arXiv fetch failed: ${res.status}`);

  const xml = await res.text();
  const doc = parser.parse(xml);
  const entries = doc?.feed?.entry ?? [];

  return entries.map((entry: Record<string, unknown>) => {
    const idRaw = textOf(entry.id);
    const arxivId = idRaw.split("/abs/").pop() ?? idRaw;
    const title = textOf(entry.title);
    const abstract = textOf(entry.summary);
    const published =
      textOf(entry.published) || textOf(entry.updated) || new Date().toISOString();
    const linkNode = entry.link;
    let absUrl = `https://arxiv.org/abs/${arxivId}`;
    if (Array.isArray(linkNode)) {
      const abs = linkNode.find(
        (l: Record<string, string>) =>
          l["@_title"] === "abs" || l["@_rel"] === "alternate"
      );
      if (abs?.["@_href"]) absUrl = abs["@_href"];
    } else if (linkNode && typeof linkNode === "object") {
      const href = (linkNode as Record<string, string>)["@_href"];
      if (href) absUrl = href;
    }

    const category = primaryCategory(entry);
    const authors = authorsOf(entry);
    const byline =
      authors.length > 0
        ? authors.join(", ") + (authors.length >= 4 ? " et al." : "")
        : undefined;
    const summary = byline
      ? `${byline}. ${abstract}`.slice(0, 420)
      : abstract;

    return toFeedItem({
      id: slugId("arxiv", arxivId),
      title,
      source: "arXiv",
      publishedAt: new Date(published).toISOString(),
      category: "Research Papers",
      summary,
      url: absUrl,
      tags: ["live", "arxiv", "paper", category],
      native: {
        authorName: byline,
        subtitle: category,
      },
    });
  });
}
