export type Category =
  | "Research Papers"
  | "Model Releases"
  | "AI Products"
  | "Industry Trends"
  | "Tools";

export type RankTier = "High Impact" | "Trending" | "Emerging";

/** User-facing Feed cue. Display-only; not a ranking input. */
export type ValueCue = "High Impact" | "New Capability" | "Developer Signal";

export type Source =
  | "OpenAI"
  | "Anthropic"
  | "Google DeepMind"
  | "Meta AI"
  | "xAI"
  | "DeepSeek"
  | "Qwen"
  | "Mistral AI"
  | "Kimi"
  | "MiniMax"
  | "Prime Intellect"
  | "ByteDance"
  | "Black Forest Labs"
  | "Thinking Machines"
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
  | "Embodied AI"
  | "机器之心"
  | "新智元"
  | "量子位"
  | "Product Hunt";

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

export type OfficialLaunchTier = "core" | "emerging" | "ecosystem";

export type OfficialSourceType =
  | "launch-page"
  | "newsroom"
  | "blog"
  | "developer-docs"
  | "changelog"
  | "official-x"
  | "external";

export type OfficialLaunchEventType =
  | "model-release"
  | "product-launch"
  | "api-release"
  | "open-source-release"
  | "major-update";

export interface OfficialLaunchEntities {
  company: string;
  product?: string;
  model?: string;
  version?: string;
}

export interface OfficialLaunchSourceRecord {
  id: string;
  organizationId: string;
  channelId: string;
  sourceType: OfficialSourceType;
  authority: number;
  role: "primary" | "supporting" | "signal";
  title: string;
  summary: string;
  /** Raw source body retained for extraction and audit; never rendered directly. */
  originalContent?: string;
  url: string;
  canonicalUrl: string;
  publishedAt: string;
  author?: string;
  imageUrl?: string;
}

export interface QualifiedLaunchRecord extends OfficialLaunchSourceRecord {
  eventType: OfficialLaunchEventType;
  entities: OfficialLaunchEntities;
  capabilities: string[];
  qualificationScore: number;
  noveltyScore: number;
  impactScore: number;
  confidence: number;
  qualificationMethod: "deterministic" | "openai";
}

export interface OfficialLaunchEvent {
  eventId: string;
  organizationId: string;
  organizationName: Source;
  tier: OfficialLaunchTier;
  eventType: OfficialLaunchEventType;
  title: string;
  summary: string;
  publishedAt: string;
  entities: OfficialLaunchEntities;
  capabilities: string[];
  qualificationScore: number;
  noveltyScore: number;
  impactScore: number;
  confidence: number;
  primarySource: OfficialLaunchSourceRecord;
  sources: OfficialLaunchSourceRecord[];
}

export interface OfficialLaunchFeedMeta {
  eventId: string;
  eventType: OfficialLaunchEventType;
  product?: string;
  model?: string;
  version?: string;
  supportingSources: Array<{
    title: string;
    url: string;
    sourceType: OfficialSourceType;
  }>;
}

export type OfficialLaunchDiagnosticStatus =
  | "accepted"
  | "rejected"
  | "merged"
  | "failed";

export type OfficialLaunchDiagnosticReason =
  | "non-launch"
  | "excluded-content-type"
  | "duplicate"
  | "semantic-merge"
  | "below-tier-threshold"
  | "fetch-failure"
  | "extraction-failure";

export type OfficialLaunchDecisionMethod =
  | "deterministic"
  | "openai-api"
  | "cache"
  | "fallback";

export interface OfficialLaunchCandidateDiagnostic {
  candidateId: string;
  organizationId: string;
  channelId?: string;
  title?: string;
  url?: string;
  stage:
    | "fetch"
    | "dedupe"
    | "enrichment"
    | "qualification"
    | "match"
    | "cluster"
    | "score";
  status: OfficialLaunchDiagnosticStatus;
  reason?: OfficialLaunchDiagnosticReason;
  method?: OfficialLaunchDecisionMethod;
  targetId?: string;
  scores?: {
    qualification: number;
    novelty: number;
    impact: number;
    confidence: number;
  };
  thresholds?: {
    qualification: number;
    novelty: number;
    impact: number;
    confidence: number;
  };
  error?: string;
  enrichmentTriggered?: boolean;
  enrichmentSkipped?: boolean;
  enrichmentCacheHit?: boolean;
  enrichmentFetchSuccess?: boolean;
  enrichmentFetchFailure?: boolean;
  enrichmentTextLength?: number;
  qualificationBeforeEnrichment?: boolean;
  qualificationAfterEnrichment?: boolean;
  recordedAt: string;
}

export interface OfficialLaunchRunDiagnostic {
  runId: string;
  startedAt: string;
  completedAt: string;
  mode: "deterministic" | "openai";
  inputCount: number;
  outputCount: number;
  candidates: OfficialLaunchCandidateDiagnostic[];
}

export type ResearchPaperRelevanceCue =
  | "Agent memory"
  | "Agents"
  | "Voice"
  | "Video"
  | "Multimodal"
  | "HCI"
  | "Eval";

export type ResearchPaperGateReason =
  | "r1-theory"
  | "r2-infra"
  | "r3-incremental"
  | "r6-else";

export type ResearchPaperDiagnosticStatus =
  | "captured"
  | "outside-window"
  | "canonicalized"
  | "duplicate"
  | "rejected"
  | "pass-candidate"
  | "published"
  | "capped";

export type ResearchPaperDiagnosticReason =
  | "outside-window"
  | "duplicate"
  | "r1-theory"
  | "r2-infra"
  | "r3-incremental"
  | "r6-else"
  | "capped"
  | "fetch-failure"
  | "canonical-failure"
  | "taxonomy-mismatch"
  | "taxonomy-background";

export interface ResearchPaper {
  arxivId: string;
  doi?: string;
  title: string;
  titleNorm: string;
  abstract: string;
  authors: string[];
  categories: string[];
  publishedAt: string;
  hfSubmittedAt?: string;
  githubUrl?: string;
  demoUrl?: string;
  institution?: string;
  upvotes?: number;
  stars?: number;
  url: string;
  venue?: string;
  venueTier?: "A" | "B";
  topic?: string;
}

export interface ResearchPaperFeedMeta {
  arxivId: string;
  relevanceCue?: ResearchPaperRelevanceCue;
}

export interface ResearchPaperCandidateDiagnostic {
  candidateId: string;
  arxivId?: string;
  title?: string;
  stage:
    | "capture"
    | "window"
    | "canonical"
    | "dedupe"
    | "gate"
    | "publish";
  status: ResearchPaperDiagnosticStatus;
  reason?: ResearchPaperDiagnosticReason;
  passCandidate?: boolean;
  upvotes?: number;
  error?: string;
  recordedAt: string;
}

export interface ResearchPaperRunDiagnostic {
  runId: string;
  startedAt: string;
  completedAt: string;
  inputCount: number;
  outputCount: number;
  windowDays: number;
  publishCap: number;
  counts: {
    captured: number;
    outsideWindow: number;
    canonicalized: number;
    duplicate: number;
    rejectedR1: number;
    rejectedR2: number;
    rejectedR3: number;
    rejectedR6: number;
    passCandidate: number;
    published: number;
    capped: number;
  };
  candidates: ResearchPaperCandidateDiagnostic[];
}

export type DeveloperCommunitySourceFamily = "hn" | "github-issues";

export type DeveloperCommunitySourceType = "hn-story" | "github-issue";

export type DeveloperCommunitySignalType =
  | "ADOPTION"
  | "FRICTION"
  | "WORKFLOW_SHIFT"
  | "MIGRATION"
  | "UNEXPECTED_USE";

export type DeveloperCommunityCandidateType =
  | DeveloperCommunitySignalType
  | "BACKLASH"
  | "EMERGING_TOOL";

export type DeveloperCommunityStatus =
  | "PUBLISH"
  | "WATCH"
  | "REVIEW_QUEUE";

export type DeveloperCommunityRejectReason =
  | "beginner-support"
  | "one-user-install"
  | "isolated-bug"
  | "self-promotion"
  | "show-hn-no-adoption"
  | "generic-opinion"
  | "meme"
  | "job-post"
  | "benchmark-argument"
  | "media-repost"
  | "official-launch-repost"
  | "unsupported-claim"
  | "duplicate"
  | "agent-spam"
  | "star-inflation"
  | "no-product-implication"
  | "insufficient-evidence"
  | "single-source"
  | "insufficient-authors"
  | "insufficient-recurrence"
  | "no-concrete-artifact"
  | "bot-author"
  | "feature-request"
  | "pull-request"
  | "not-allowlisted"
  | "capped";

export interface DeveloperCommunityEvidence {
  evidenceId: string;
  sourceFamily: DeveloperCommunitySourceFamily;
  sourceType: DeveloperCommunitySourceType;
  sourceUrl: string;
  repository?: string;
  product: string;
  normalizedTopic: string;
  candidateSignalType: DeveloperCommunityCandidateType;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  bodySummary: string;
  concreteArtifact: boolean;
  productImplication: boolean;
  engagement?: {
    points?: number;
    comments?: number;
    stars?: number;
    forks?: number;
  };
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface CommunitySignal {
  signalId: string;
  topic: string;
  signalType: DeveloperCommunityCandidateType;
  products: string[];
  summary: string;
  evidence: DeveloperCommunityEvidence[];
  firstSeenAt: string;
  lastSeenAt: string;
  sourceCount: number;
  uniqueAuthorCount: number;
  confidence: "high" | "medium" | "low";
  productImplication: boolean;
  status: DeveloperCommunityStatus;
  reason?: DeveloperCommunityRejectReason;
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
  officialLaunch?: OfficialLaunchFeedMeta;
  researchPaper?: ResearchPaperFeedMeta;
  /** Display-only cue stamped after ranking. Never an input to ranking. */
  valueCue?: ValueCue;
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

export type InsightRole = "SUPPLY" | "CAPABILITY" | "ADOPTION";

export type InsightStance = "supports" | "contradicts" | "qualifies";

export type InsightType =
  | "CAPABILITY_SHIFT"
  | "ADOPTION_SHIFT"
  | "EXPECTATION_SHIFT"
  | "WORKFLOW_SHIFT"
  | "FRICTION_PATTERN"
  | "CONVERGENCE";

export type InsightStatus = "PUBLISH" | "WATCH" | "NOT_INSIGHT";

export type InsightFreshness = "CURRENT" | "AGING" | "STALE";

export type InsightConfidence = "HIGH" | "MEDIUM" | "LOW";

export type InsightActionVerb = "reconsider" | "test" | "watch" | "validate";

export type InsightCapabilityKey =
  | "coding-agent"
  | "tool-calling"
  | "session-state"
  | "persistent-memory"
  | "onboarding"
  | "multimodal-agent"
  | "voice"
  | "generative-ui"
  | "mcp"
  | "agent-skills";

export interface InsightEvidence {
  objectId: string;
  role: InsightRole;
  stance: InsightStance;
  source: string;
  organization: string;
  title: string;
  timestamp: string;
  url?: string;
}

export interface Insight {
  insightId: string;
  headline: string;
  thesis: string;
  type: InsightType;
  clusterKeys: string[];
  evidence: InsightEvidence[];
  whyItMatters: string;
  productImplication: string;
  actionVerb: InsightActionVerb;
  confidence: InsightConfidence;
  status: InsightStatus;
  freshness: InsightFreshness;
  contradiction: boolean;
  timeWindow: { start: string; end: string };
  firstSeenAt: string;
  lastUpdatedAt: string;
  roles: InsightRole[];
  organizations: string[];
}