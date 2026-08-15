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
    description: "Papers and research hubs",
    sources: ["arXiv", "Hugging Face"],
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
