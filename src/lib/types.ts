export type Category =
  | "Research Papers"
  | "Model Releases"
  | "AI Products"
  | "Industry Trends"
  | "Tools";

export type RankTier = "High Impact" | "Trending" | "Emerging";

export type Source =
  | "OpenAI"
  | "Anthropic"
  | "Google DeepMind"
  | "DeepSeek"
  | "Kimi"
  | "ByteDance"
  | "Black Forest Labs"
  | "Hugging Face"
  | "arXiv"
  | "Tech Blog"
  | "Developer Community"
  | "GitHub · Articles"
  | "GitHub · Skills"
  | "GitHub · Projects"
  | "X (Twitter)"
  | "YouTube"
  | "Foreign Media"
  | "Embodied AI";

export interface Scores {
  impact: number;
  relevance: number;
  trend: number;
}

export interface ImpactBrief {
  whatHappened: string;
  whyItMatters: string;
  potentialImpact: string;
  keyTakeaway: string;
}

/** Platform-native fields for source cards (engagement, bylines, etc.) */
export interface NativeMeta {
  authorName?: string;
  authorHandle?: string;
  /** Short label: arXiv category, channel, language, etc. */
  subtitle?: string;
  points?: number;
  comments?: number;
  likes?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  stars?: number;
  forks?: number;
  views?: number;
  /** e.g. "12:34" for YouTube */
  durationLabel?: string;
  /** GitHub owner/repo — shown as secondary label, not the card title */
  repoName?: string;
}

export interface FeedItem {
  id: string;
  title: string;
  source: Source;
  publishedAt: string;
  category: Category;
  summary: string;
  scores: Scores;
  tier: RankTier;
  tags: string[];
  url: string;
  brief: ImpactBrief;
  readingTimeMin: number;
  /** Optional article/video cover (not avatars) */
  imageUrl?: string;
  /** Author / org avatar — small UI only, never as a hero cover */
  avatarUrl?: string;
  native?: NativeMeta;
  /** Pre-AI / raw title kept for bad-case analysis */
  originalTitle?: string;
  /** Pre-AI / raw summary kept for bad-case analysis */
  originalSummary?: string;
}

export type BadCaseReason =
  | "title"
  | "summary"
  | "ranking"
  | "relevance"
  | "other";

export interface BadCaseRecord {
  id: string;
  itemId: string;
  reason: BadCaseReason;
  note?: string;
  snapshot: {
    title: string;
    originalTitle?: string;
    summary: string;
    originalSummary?: string;
    source: Source;
    url: string;
    category: Category;
    tier: RankTier;
    scores: Scores;
    tags: string[];
  };
  createdAt: string;
  /** auto = heuristic detector; user = flagged in UI */
  origin: "auto" | "user";
}