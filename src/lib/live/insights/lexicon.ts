import type { InsightCapabilityKey } from "@/lib/types";

type LexiconRule = {
  key: InsightCapabilityKey;
  patterns: RegExp[];
};

const RULES: LexiconRule[] = [
  {
    key: "tool-calling",
    patterns: [
      /function_call/i,
      /tool[- ]call(?:ing)?/i,
      /\btool use\b/i,
      /\bcalltool\b/i,
    ],
  },
  {
    key: "session-state",
    patterns: [
      /session[- ](?:state|failure|drop|lost|resume)/i,
      /cross[- ]session/i,
      /session state is dropping/i,
    ],
  },
  {
    key: "onboarding",
    patterns: [
      /install[- ]platform/i,
      /install and platform setup/i,
      /\binstall\b.{0,48}\b(setup|platform|windows|wsl|npm|pip|uv |brew)\b/i,
    ],
  },
  {
    key: "mcp",
    patterns: [/\bmcp\b/i, /model context protocol/i],
  },
  {
    key: "agent-skills",
    patterns: [
      /workflow-skills/i,
      /colleague\.skill/i,
      /\bskills?\b.{0,32}(packag|workflow|claude\.md|agents\.md)/i,
    ],
  },
  {
    key: "persistent-memory",
    patterns: [
      /long[- ]term memory/i,
      /persistent memory/i,
      /lycheememory/i,
      /\b1m context\b/i,
      /context cach/i,
      /persisted reasoning/i,
      /memory-context/i,
      /memory and context overhead/i,
    ],
  },
  {
    key: "multimodal-agent",
    patterns: [
      /visual agentic/i,
      /native multimodality/i,
      /audio[- ]visual/i,
      /multimodal agent/i,
    ],
  },
  {
    key: "voice",
    patterns: [
      /\btts\b/i,
      /voice (?:think|model|agent|fast)/i,
      /speech synthes/i,
      /gpt[- ]realtime/i,
    ],
  },
  {
    key: "generative-ui",
    patterns: [/generative ui/i, /generative user interface/i],
  },
  {
    key: "coding-agent",
    patterns: [
      /visual agentic/i,
      /coding agents?/i,
      /agentic coding/i,
      /& agent\b/i,
      /\bagent:\b/i,
      /vibe gets to work/i,
      /build mode/i,
      /github copilot/i,
      /frontier coding/i,
      /claude code/i,
      /claude-code/i,
      /\bcline\b/i,
      /\bopencode\b/i,
      /multi[- ]language programming/i,
      /real[- ]world productivity/i,
    ],
  },
];

export function capabilityKeysFor(text: string): InsightCapabilityKey[] {
  const haystack = text.trim();
  if (!haystack) return [];
  const keys: InsightCapabilityKey[] = [];
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      keys.push(rule.key);
    }
  }
  return keys;
}

export function organizationKeyOf(input: {
  organizationId?: string;
  source?: string;
  organization?: string;
}): string {
  const raw =
    input.organizationId || input.organization || input.source || "unknown";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function productFamilyOf(input: {
  role: "SUPPLY" | "CAPABILITY" | "ADOPTION";
  products?: string[];
  title?: string;
  organizationKey: string;
}): string {
  if (input.role === "ADOPTION") {
    const named = input.products?.find((product) => product && product !== "unknown");
    if (named) return named.toLowerCase();
    const prefix = input.title?.match(/^([a-z0-9-]+):/i)?.[1];
    if (prefix) return prefix.toLowerCase();
  }
  return input.organizationKey;
}
