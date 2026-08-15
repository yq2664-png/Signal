import { makeResearchPaperBrief, extractFinding } from "@/lib/live/research-paper/brief";
import { slugId, toFeedItem } from "@/lib/live/normalize";
import type {
  FeedItem,
  ResearchPaper,
  ResearchPaperRelevanceCue,
} from "@/lib/types";

function byline(paper: ResearchPaper): string | undefined {
  if (paper.institution) return paper.institution;
  if (paper.authors.length === 0) return undefined;
  const names = paper.authors.slice(0, 3);
  return names.join(", ") + (paper.authors.length > 3 ? " et al." : "");
}

function paperFeedId(paper: ResearchPaper): string {
  if (paper.arxivId) return slugId("arxiv", paper.arxivId);
  if (paper.doi) return slugId("doi", paper.doi);
  return slugId("paper", paper.titleNorm || paper.title);
}

export function researchPaperToFeedItem(
  paper: ResearchPaper,
  cue?: ResearchPaperRelevanceCue
): FeedItem {
  const finding = extractFinding(paper.title, paper.abstract);
  const item = toFeedItem({
    id: paperFeedId(paper),
    title: paper.title,
    originalTitle: paper.title,
    summary: finding,
    originalSummary: paper.abstract.slice(0, 420),
    source: "arXiv",
    publishedAt: paper.publishedAt,
    category: "Research Papers",
    url: paper.url,
    tags: [
      "live",
      "research-paper",
      ...(paper.arxivId ? ["arxiv", paper.arxivId] : []),
      ...(paper.doi ? [paper.doi] : []),
      ...(paper.categories.slice(0, 2) ?? []),
    ],
    native: {
      authorName: byline(paper),
      subtitle: cue ?? paper.venue ?? paper.categories[0],
    },
  });

  return {
    ...item,
    brief: makeResearchPaperBrief(paper, cue),
    researchPaper: {
      arxivId: paper.arxivId,
      relevanceCue: cue,
    },
  };
}

export function researchPapersToFeedItems(
  papers: Array<{ paper: ResearchPaper; cue?: ResearchPaperRelevanceCue }>
): FeedItem[] {
  return papers.map(({ paper, cue }) => researchPaperToFeedItem(paper, cue));
}
