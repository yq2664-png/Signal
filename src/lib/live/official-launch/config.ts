import type {
  OfficialLaunchTier,
  OfficialSourceType,
  Source,
} from "@/lib/types";

export type OfficialChannelRole = "primary" | "supporting" | "signal";
export type OfficialChannelAdapter =
  | "rss"
  | "html-list"
  | "html-release-notes"
  | "markdown-release-notes";
export type MarkdownReleaseNotesMode = "date-sections" | "date-bullets";

export interface OfficialLaunchChannelConfig {
  channelId: string;
  sourceType: OfficialSourceType;
  url: string;
  adapter: OfficialChannelAdapter;
  authority: number;
  role: OfficialChannelRole;
  enabled?: boolean;
  limit?: number;
  linkPattern?: string;
  markdownMode?: MarkdownReleaseNotesMode;
}

export interface OfficialLaunchOrganizationConfig {
  organizationId: string;
  displayName: Source;
  aliases: string[];
  tier: OfficialLaunchTier;
  knownProducts: string[];
  publishThresholds: {
    qualification: number;
    novelty: number;
    impact: number;
  };
  channels: OfficialLaunchChannelConfig[];
}

export const OFFICIAL_LAUNCH_ORGANIZATIONS: OfficialLaunchOrganizationConfig[] = [
  {
    organizationId: "openai",
    displayName: "OpenAI",
    aliases: ["OpenAI"],
    tier: "core",
    knownProducts: ["ChatGPT", "GPT", "Codex", "Sora", "o1", "o3", "o4"],
    publishThresholds: { qualification: 72, novelty: 50, impact: 55 },
    channels: [
      {
        channelId: "openai-news",
        sourceType: "newsroom",
        url: "https://openai.com/news/rss.xml",
        adapter: "rss",
        authority: 90,
        role: "primary",
        limit: 12,
      },
      {
        channelId: "openai-developer",
        sourceType: "developer-docs",
        url: "https://platform.openai.com/docs/changelog.md",
        adapter: "markdown-release-notes",
        authority: 78,
        role: "supporting",
        limit: 12,
        markdownMode: "date-sections",
      },
      {
        channelId: "openai-x",
        sourceType: "official-x",
        url: "https://x.com/OpenAI",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
  {
    organizationId: "anthropic",
    displayName: "Anthropic",
    aliases: ["Anthropic", "Claude"],
    tier: "core",
    knownProducts: ["Claude", "Claude Code", "Console", "Anthropic API"],
    publishThresholds: { qualification: 72, novelty: 50, impact: 55 },
    channels: [
      {
        channelId: "anthropic-news",
        sourceType: "newsroom",
        url: "https://www.anthropic.com/news",
        adapter: "html-list",
        authority: 90,
        role: "primary",
        limit: 12,
        linkPattern: "/news/",
      },
      {
        channelId: "anthropic-release-notes",
        sourceType: "changelog",
        url: "https://docs.anthropic.com/en/release-notes/overview.md",
        adapter: "markdown-release-notes",
        authority: 76,
        role: "supporting",
        limit: 12,
        markdownMode: "date-bullets",
      },
    ],
  },
  {
    organizationId: "thinking-machines",
    displayName: "Thinking Machines",
    aliases: ["Thinking Machines", "Thinking Machines Lab"],
    tier: "emerging",
    knownProducts: ["Tinker", "Inkling", "Inkling-Small"],
    publishThresholds: { qualification: 78, novelty: 68, impact: 68 },
    channels: [
      {
        channelId: "thinking-machines-news",
        sourceType: "launch-page",
        url: "https://thinkingmachines.ai/news/",
        adapter: "html-list",
        authority: 100,
        role: "primary",
        limit: 12,
        linkPattern: "/news/",
      },
      {
        channelId: "thinking-machines-connectionism",
        sourceType: "blog",
        url: "https://thinkingmachines.ai/blog/index.xml",
        adapter: "rss",
        authority: 82,
        role: "supporting",
        limit: 8,
      },
    ],
  },
  {
    // Core: frontier Gemini/Gemma launches. Blog RSS is high-volume mixed
    // research; Google AI blog is supporting product-launch overlap.
    organizationId: "google-deepmind",
    displayName: "Google DeepMind",
    aliases: ["Google DeepMind", "DeepMind", "Google", "Gemini"],
    tier: "core",
    knownProducts: [
      "Gemini",
      "Gemma",
      "Lyria",
      "Imagen",
      "Veo",
      "Nano Banana",
      "Google AI Studio",
    ],
    publishThresholds: { qualification: 72, novelty: 50, impact: 55 },
    channels: [
      {
        channelId: "google-deepmind-news",
        sourceType: "newsroom",
        url: "https://deepmind.google/blog/rss.xml",
        adapter: "rss",
        authority: 95,
        role: "primary",
        limit: 12,
      },
      {
        channelId: "google-ai-blog",
        sourceType: "blog",
        url: "https://blog.google/technology/ai/rss/",
        adapter: "rss",
        authority: 82,
        role: "supporting",
        limit: 10,
      },
      {
        channelId: "google-deepmind-x",
        sourceType: "official-x",
        url: "https://x.com/GoogleDeepMind",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
  {
    // Core: Llama and Meta AI product launches. Blog HTML is the first-party
    // newsroom; GitHub llama-models is library versioning, not model launches.
    organizationId: "meta-ai",
    displayName: "Meta AI",
    aliases: ["Meta AI", "Meta", "Llama", "Facebook AI"],
    tier: "core",
    knownProducts: [
      "Llama",
      "Muse Spark",
      "Muse",
      "Segment Anything",
      "DINO",
      "Meta AI",
    ],
    publishThresholds: { qualification: 72, novelty: 50, impact: 55 },
    channels: [
      {
        channelId: "meta-ai-blog",
        sourceType: "newsroom",
        url: "https://ai.meta.com/blog/",
        adapter: "html-list",
        authority: 94,
        role: "primary",
        limit: 12,
        linkPattern: "/blog/",
      },
      {
        channelId: "meta-ai-x",
        sourceType: "official-x",
        url: "https://x.com/AIatMeta",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
  {
    // Core: Grok model and API launches. News HTML is the only reliable
    // first-party listing; docs release-notes is a client-rendered SPA.
    organizationId: "xai",
    displayName: "xAI",
    aliases: ["xAI", "Grok"],
    tier: "core",
    knownProducts: ["Grok", "Grok Imagine", "Grok Build", "Grok Voice"],
    publishThresholds: { qualification: 72, novelty: 50, impact: 55 },
    channels: [
      {
        channelId: "xai-news",
        sourceType: "newsroom",
        url: "https://x.ai/news/",
        adapter: "html-list",
        authority: 94,
        role: "primary",
        limit: 12,
        linkPattern: "/news/",
      },
      {
        channelId: "xai-x",
        sourceType: "official-x",
        url: "https://x.com/xai",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
  {
    // Core: DeepSeek model/API GA updates. Changelog HTML is dated and
    // launch-bearing; GitHub release atoms are stale or empty.
    organizationId: "deepseek",
    displayName: "DeepSeek",
    aliases: ["DeepSeek"],
    tier: "core",
    knownProducts: [
      "DeepSeek-V4-Pro",
      "DeepSeek-V4-Flash",
      "DeepSeek-V4",
      "DeepSeek-V3",
      "DeepSeek-R1",
      "DeepSeek",
    ],
    publishThresholds: { qualification: 72, novelty: 50, impact: 55 },
    channels: [
      {
        channelId: "deepseek-updates",
        sourceType: "changelog",
        url: "https://api-docs.deepseek.com/updates",
        adapter: "html-release-notes",
        authority: 94,
        role: "primary",
        limit: 12,
      },
    ],
  },
  {
    // Core: Qwen model and open-weight launches. Official blog RSS remains
    // first-party; qwen.ai/research is a client-rendered SPA without a feed.
    organizationId: "qwen",
    displayName: "Qwen",
    aliases: ["Qwen", "Alibaba", "Tongyi", "QwenLM"],
    tier: "core",
    knownProducts: ["Qwen", "Qwen3", "Qwen3Guard", "Qwen-Image", "Qwen-Code"],
    publishThresholds: { qualification: 72, novelty: 50, impact: 55 },
    channels: [
      {
        channelId: "qwen-blog",
        sourceType: "newsroom",
        url: "https://qwenlm.github.io/blog/index.xml",
        adapter: "rss",
        authority: 94,
        role: "primary",
        limit: 12,
      },
      {
        channelId: "qwen-x",
        sourceType: "official-x",
        url: "https://x.com/Alibaba_Qwen",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
  {
    // Core: Mistral model, API, and product launches. News RSS is complete
    // and dated; GitHub mistral-common is library patch noise.
    organizationId: "mistral",
    displayName: "Mistral AI",
    aliases: ["Mistral AI", "Mistral"],
    tier: "core",
    knownProducts: [
      "Mistral",
      "Mixtral",
      "Codestral",
      "Devstral",
      "Pixtral",
      "Shieldstral",
      "Le Chat",
      "Mistral OCR",
    ],
    publishThresholds: { qualification: 72, novelty: 50, impact: 55 },
    channels: [
      {
        channelId: "mistral-news",
        sourceType: "newsroom",
        url: "https://mistral.ai/news/rss",
        adapter: "rss",
        authority: 94,
        role: "primary",
        limit: 12,
      },
      {
        channelId: "mistral-x",
        sourceType: "official-x",
        url: "https://x.com/MistralAI",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
  {
    // Emerging: distributed training / RL launches. Blog HTML is the
    // first-party listing; GitHub prime-rl is library versioning noise.
    organizationId: "prime-intellect",
    displayName: "Prime Intellect",
    aliases: ["Prime Intellect"],
    tier: "emerging",
    knownProducts: [
      "INTELLECT-3",
      "INTELLECT-2",
      "INTELLECT-1",
      "Lab",
      "Environments Hub",
      "prime-rl",
    ],
    publishThresholds: { qualification: 78, novelty: 68, impact: 68 },
    channels: [
      {
        channelId: "prime-intellect-blog",
        sourceType: "blog",
        url: "https://www.primeintellect.ai/blog",
        adapter: "html-list",
        authority: 94,
        role: "primary",
        limit: 12,
        linkPattern: "/blog/",
      },
      {
        channelId: "prime-intellect-x",
        sourceType: "official-x",
        url: "https://x.com/PrimeIntellect",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
  {
    // Emerging: Kimi model launches. Official blog HTML is the first-party
    // listing; GitHub Kimi-K2 releases.atom is isolated from legacy RSS.
    organizationId: "moonshot",
    displayName: "Kimi",
    aliases: ["Kimi", "Moonshot", "Moonshot AI"],
    tier: "emerging",
    knownProducts: [
      "Kimi K3",
      "Kimi K2.6",
      "Kimi K2.5",
      "Kimi K2",
      "Kimi Code",
      "Kimi Work",
      "Kimi",
    ],
    publishThresholds: { qualification: 78, novelty: 68, impact: 68 },
    channels: [
      {
        channelId: "moonshot-blog",
        sourceType: "blog",
        url: "https://www.kimi.com/blog",
        adapter: "html-list",
        authority: 94,
        role: "primary",
        limit: 12,
        linkPattern: "/blog/",
      },
      {
        channelId: "moonshot-x",
        sourceType: "official-x",
        url: "https://x.com/Kimi_Moonshot",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
  {
    // Emerging: MiniMax model / multimodal launches. Blog HTML is the
    // parseable first-party listing; newsroom is an incomplete SPA.
    organizationId: "minimax",
    displayName: "MiniMax",
    aliases: ["MiniMax"],
    tier: "emerging",
    knownProducts: [
      "MiniMax M3",
      "MiniMax M2.7",
      "MiniMax M2.5",
      "MiniMax M2.1",
      "MiniMax M2",
      "MiniMax H3",
      "MiniMax-Hailuo-2.3",
      "Hailuo",
      "MiniMax Agent",
    ],
    publishThresholds: { qualification: 78, novelty: 68, impact: 68 },
    channels: [
      {
        channelId: "minimax-blog",
        sourceType: "blog",
        url: "https://www.minimax.io/blog",
        adapter: "html-list",
        authority: 94,
        role: "primary",
        limit: 12,
        linkPattern: "/blog/",
      },
      {
        channelId: "minimax-release-notes",
        sourceType: "changelog",
        url: "https://platform.minimax.io/docs/release-notes/apis.md",
        adapter: "markdown-release-notes",
        authority: 78,
        role: "supporting",
        limit: 12,
        markdownMode: "date-bullets",
      },
      {
        channelId: "minimax-x",
        sourceType: "official-x",
        url: "https://x.com/MiniMax__AI",
        adapter: "html-list",
        authority: 65,
        role: "signal",
        enabled: false,
      },
    ],
  },
];

export function getOfficialLaunchOrganization(
  organizationId: string
): OfficialLaunchOrganizationConfig | undefined {
  return OFFICIAL_LAUNCH_ORGANIZATIONS.find(
    (organization) => organization.organizationId === organizationId
  );
}
