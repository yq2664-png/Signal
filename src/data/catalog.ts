import type { Category, RankTier, Source } from "@/lib/types";

export const categories: Category[] = [
  "Research Papers",
  "Model Releases",
  "AI Products",
  "Industry Trends",
  "Tools",
];

export const tiers: RankTier[] = ["High Impact", "Trending", "Emerging"];

/** Live API sources only */
export const sources: Source[] = [
  "OpenAI",
  "Anthropic",
  "Google DeepMind",
  "DeepSeek",
  "Kimi",
  "ByteDance",
  "Black Forest Labs",
  "Hugging Face",
  "arXiv",
  "Tech Blog",
  "Developer Community",
  "GitHub · Articles",
  "GitHub · Skills",
  "GitHub · Projects",
  "X (Twitter)",
  "YouTube",
  "Foreign Media",
  "Embodied AI",
];
