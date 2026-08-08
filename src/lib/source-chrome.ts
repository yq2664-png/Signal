import type { Source } from "@/lib/types";

export type SourceChrome = {
  handle: string;
  domain: string;
  mark: string;
  accent: string;
  accentSoft: string;
  chrome: string;
  /** Real site URL for native window / optional iframe */
  liveUrl: string;
  /**
   * iframe = page usually allows embedding
   * popup = platform blocks iframe; open real native window instead
   */
  embed: "iframe" | "popup";
  kind:
    | "lab"
    | "paper"
    | "blog"
    | "forum"
    | "repo"
    | "tweet"
    | "youtube"
    | "press";
};

export const sourceChrome: Record<Source, SourceChrome> = {
  OpenAI: {
    handle: "openai",
    domain: "openai.com/news",
    mark: "OAI",
    accent: "#10a37f",
    accentSoft: "rgba(16, 163, 127, 0.14)",
    chrome: "#0d1512",
    liveUrl: "https://openai.com/news",
    embed: "popup",
    kind: "lab",
  },
  Anthropic: {
    handle: "anthropic",
    domain: "anthropic.com/news",
    mark: "ANT",
    accent: "#d4a27f",
    accentSoft: "rgba(212, 162, 127, 0.14)",
    chrome: "#15110e",
    liveUrl: "https://www.anthropic.com/news",
    embed: "popup",
    kind: "lab",
  },
  "Google DeepMind": {
    handle: "deepmind",
    domain: "deepmind.google/discover",
    mark: "GDM",
    accent: "#4285f4",
    accentSoft: "rgba(66, 133, 244, 0.14)",
    chrome: "#0e1218",
    liveUrl: "https://deepmind.google/discover/blog/",
    embed: "popup",
    kind: "lab",
  },
  DeepSeek: {
    handle: "deepseek",
    domain: "github.com/deepseek-ai",
    mark: "DS",
    accent: "#4d6bfe",
    accentSoft: "rgba(77, 107, 254, 0.14)",
    chrome: "#0e1220",
    liveUrl: "https://github.com/deepseek-ai",
    embed: "popup",
    kind: "lab",
  },
  Kimi: {
    handle: "kimi",
    domain: "github.com/MoonshotAI",
    mark: "Ki",
    accent: "#1783ff",
    accentSoft: "rgba(23, 131, 255, 0.14)",
    chrome: "#0c1420",
    liveUrl: "https://github.com/MoonshotAI",
    embed: "popup",
    kind: "lab",
  },
  ByteDance: {
    handle: "bytedance",
    domain: "github.com/ByteDance-Seed",
    mark: "Byte",
    accent: "#fe2c55",
    accentSoft: "rgba(254, 44, 85, 0.14)",
    chrome: "#140a0e",
    liveUrl: "https://github.com/ByteDance-Seed",
    embed: "popup",
    kind: "lab",
  },
  "Black Forest Labs": {
    handle: "bfl",
    domain: "github.com/black-forest-labs",
    mark: "BFL",
    accent: "#7cff6b",
    accentSoft: "rgba(124, 255, 107, 0.12)",
    chrome: "#0c120e",
    liveUrl: "https://github.com/black-forest-labs",
    embed: "popup",
    kind: "lab",
  },
  "Hugging Face": {
    handle: "huggingface",
    domain: "huggingface.co/blog",
    mark: "HF",
    accent: "#ff9d0a",
    accentSoft: "rgba(255, 157, 10, 0.14)",
    chrome: "#16120a",
    liveUrl: "https://huggingface.co/blog",
    embed: "popup",
    kind: "lab",
  },
  arXiv: {
    handle: "arxiv",
    domain: "arxiv.org/list/cs.AI/recent",
    mark: "arX",
    accent: "#b31b1b",
    accentSoft: "rgba(179, 27, 27, 0.14)",
    chrome: "#140e0e",
    liveUrl: "https://arxiv.org/list/cs.AI/recent",
    embed: "iframe",
    kind: "paper",
  },
  "Tech Blog": {
    handle: "techblog",
    domain: "simonwillison.net",
    mark: "TB",
    accent: "#8a8f98",
    accentSoft: "rgba(138, 143, 152, 0.12)",
    chrome: "#101112",
    liveUrl: "https://simonwillison.net/",
    embed: "iframe",
    kind: "blog",
  },
  "Developer Community": {
    handle: "devcommunity",
    domain: "news.ycombinator.com",
    mark: "YC",
    accent: "#ff6600",
    accentSoft: "rgba(255, 102, 0, 0.14)",
    chrome: "#14100c",
    liveUrl: "https://news.ycombinator.com/",
    embed: "iframe",
    kind: "forum",
  },
  "GitHub · Articles": {
    handle: "github-articles",
    domain: "github.blog",
    mark: "GHa",
    accent: "#f0f6fc",
    accentSoft: "rgba(240, 246, 252, 0.08)",
    chrome: "#0d1117",
    liveUrl: "https://github.blog/ai-and-ml/",
    embed: "popup",
    kind: "blog",
  },
  "GitHub · Skills": {
    handle: "github-skills",
    domain: "github.com/topics/agent-skills",
    mark: "GHs",
    accent: "#a5d6ff",
    accentSoft: "rgba(165, 214, 255, 0.12)",
    chrome: "#0d1117",
    liveUrl: "https://github.com/topics/agent-skills",
    embed: "popup",
    kind: "repo",
  },
  "GitHub · Projects": {
    handle: "github-projects",
    domain: "github.com/topics/llm",
    mark: "GHp",
    accent: "#f0f6fc",
    accentSoft: "rgba(240, 246, 252, 0.08)",
    chrome: "#0d1117",
    liveUrl: "https://github.com/topics/llm",
    embed: "popup",
    kind: "repo",
  },
  "X (Twitter)": {
    handle: "x_ai_signal",
    domain: "x.com/explore",
    mark: "𝕏",
    accent: "#e7e9ea",
    accentSoft: "rgba(231, 233, 234, 0.08)",
    chrome: "#000000",
    liveUrl: "https://x.com/explore",
    embed: "popup",
    kind: "tweet",
  },
  YouTube: {
    handle: "YouTube",
    domain: "youtube.com/results?search_query=AI",
    mark: "▶",
    accent: "#ff0033",
    accentSoft: "rgba(255, 0, 51, 0.14)",
    chrome: "#0f0f0f",
    liveUrl: "https://www.youtube.com/results?search_query=artificial+intelligence",
    embed: "popup",
    kind: "youtube",
  },
  "Foreign Media": {
    handle: "wire",
    domain: "theverge.com/ai-artificial-intelligence",
    mark: "FM",
    accent: "#f5c518",
    accentSoft: "rgba(245, 197, 24, 0.12)",
    chrome: "#10100c",
    liveUrl: "https://www.theverge.com/ai-artificial-intelligence",
    embed: "popup",
    kind: "press",
  },
  "Embodied AI": {
    handle: "embodied",
    domain: "therobotreport.com",
    mark: "Emb",
    accent: "#5eead4",
    accentSoft: "rgba(94, 234, 212, 0.12)",
    chrome: "#0a1412",
    liveUrl: "https://www.therobotreport.com/",
    embed: "popup",
    kind: "press",
  },
};

export function openNativeSourceWindow(source: Source) {
  const chrome = sourceChrome[source];
  const width = 440;
  const height = 780;
  const left = Math.max(0, window.screenX + window.outerWidth - width - 24);
  const top = Math.max(0, window.screenY + 48);
  window.open(
    chrome.liveUrl,
    `signal-native-${source}`,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},noopener,noreferrer`
  );
}
