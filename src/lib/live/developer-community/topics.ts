import type { DeveloperCommunityCandidateType } from "@/lib/types";

const TOPICS: Array<{ topic: string; pattern: RegExp }> = [
  {
    topic: "session-failure",
    pattern:
      /\b(cross[- ]session|session (?:drop|lost|resume|failure)|fails to load sessions|silently dropped|approval.{0,24}never)\b/i,
  },
  {
    topic: "mcp-runtime",
    pattern:
      /\b(mcp[- ]server|fails? to start|incompatible mcp|initialize method|stdio mcp|fetch drops|mcp version)\b/i,
  },
  {
    topic: "tool-calling",
    pattern:
      /function_call|\b(tool call(?:ing)?|tool use|calltool|tools? fail|empty list|tool output|unknown mcp tool)\b/i,
  },
  {
    topic: "reliability-transport",
    pattern:
      /\b(timeout|disconnect|reconnect|streamable|sse|hang|crash|eof|retry budget)\b/i,
  },
  {
    topic: "memory-context",
    pattern:
      /\b(memory|context window|token|compaction|preamble|truncat)\b/i,
  },
  {
    topic: "auth-security",
    pattern: /\b(oauth|www-authenticate|sandbox|permission|wipe|recursive delete)\b/i,
  },
  {
    topic: "install-platform",
    pattern: /\b(install|windows|wsl|path|npm|pip |uv |brew)\b/i,
  },
  {
    topic: "workflow-skills",
    pattern: /\b(skill|agents\.md|claude\.md|hook|harness|workflow)\b/i,
  },
];

export function normalizeTopic(title: string, body = ""): string {
  const text = `${title}\n${body}`;
  return TOPICS.find((item) => item.pattern.test(text))?.topic ?? "other";
}

export function candidateTypeFor(
  topic: string,
  title: string,
  body = ""
): DeveloperCommunityCandidateType {
  const text = `${title}\n${body}`;
  if (/\b(dead|abandon|boycott|never using|moving away|worse to work with)\b/i.test(text)) {
    return "BACKLASH";
  }
  if (topic === "workflow-skills") return "WORKFLOW_SHIFT";
  if (/\b(migrat|switch(?:ing)? from|replaced .+ with)\b/i.test(text)) {
    return "MIGRATION";
  }
  if (/\b(unexpected|not how .{0,40}positioned|users? expect)\b/i.test(text)) {
    return "UNEXPECTED_USE";
  }
  if (
    topic === "mcp-runtime" ||
    topic === "reliability-transport" ||
    topic === "tool-calling" ||
    topic === "session-failure" ||
    topic === "memory-context"
  ) {
    return "FRICTION";
  }
  return "FRICTION";
}
