import type { Source } from "@/lib/types";

export type SourceGroupId = "labs" | "research" | "community";

export interface SourceGroup {
  id: SourceGroupId;
  label: string;
  description: string;
  sources: Source[];
}

export const sourceGroups: SourceGroup[] = [
  {
    id: "labs",
    label: "Official Launch",
    description: "Official model labs",
    sources: [
      "OpenAI",
      "Anthropic",
      "Google DeepMind",
      "Meta AI",
      "xAI",
      "DeepSeek",
      "Qwen",
      "Mistral AI",
      "Kimi",
      "MiniMax",
      "Prime Intellect",
      "ByteDance",
      "Black Forest Labs",
      "Thinking Machines",
    ],
  },
  {
    id: "research",
    label: "Research Paper",
    description: "HF Daily Papers plus trusted venues, canonicalized when they have an arXiv id",
    sources: ["arXiv"],
  },
  {
    id: "community",
    label: "Developer Community",
    description: "Builders, social, press, embodied AI",
    sources: [
      "Tech Blog",
      "Developer Community",
      "GitHub · Articles",
      "GitHub · Skills",
      "GitHub · Projects",
      "Hugging Face",
      "X (Twitter)",
      "YouTube",
      "Foreign Media",
      "Embodied AI",
      "机器之心",
      "新智元",
      "量子位",
      "Product Hunt",
    ],
  },
];

export function groupIdForSource(source: Source): SourceGroupId {
  for (const group of sourceGroups) {
    if (group.sources.includes(source)) return group.id;
  }
  return "community";
}

/** Chip grouping: papers and launches follow pipeline identity, not the host domain. */
export function groupIdForItem(item: {
  source: Source;
  category?: string;
  officialLaunch?: unknown;
  researchPaper?: unknown;
}): SourceGroupId {
  if (item.researchPaper || item.category === "Research Papers") return "research";
  if (item.officialLaunch) return "labs";
  return groupIdForSource(item.source);
}
