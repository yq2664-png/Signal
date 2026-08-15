import type { InsightCapabilityKey } from "@/lib/types";

export const EVIDENCE_WINDOW_DAYS = 21;

export const CURRENT_DAYS = 14;

export const CAPABILITY_KEYS: InsightCapabilityKey[] = [
  "coding-agent",
  "tool-calling",
  "session-state",
  "persistent-memory",
  "onboarding",
  "multimodal-agent",
  "voice",
  "generative-ui",
  "mcp",
  "agent-skills",
];

export const CONFIDENCE_RANK: Record<"HIGH" | "MEDIUM" | "LOW", number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const KNOWN_NAMES = [
  "OpenAI",
  "Anthropic",
  "Google DeepMind",
  "DeepMind",
  "Google",
  "Meta AI",
  "Meta",
  "xAI",
  "DeepSeek",
  "Qwen",
  "Mistral",
  "Kimi",
  "MiniMax",
  "Thinking Machines",
  "Prime Intellect",
  "Claude",
  "Gemini",
  "Grok",
  "ChatGPT",
  "Cline",
  "OpenCode",
  "MCP",
  "Vercel",
  "LycheeMemory",
  "Mem0",
  "UniMoMo",
  "MatrAIx",
  "Robostral",
];
