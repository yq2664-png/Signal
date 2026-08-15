import type { FeedItem } from "@/lib/types";
import { assignRole } from "@/lib/live/ranking/role";

export function organizationOf(item: FeedItem): string {
  const role = assignRole(item);
  if (role === "SUPPLY") return item.source;
  if (role === "ADOPTION") {
    const product = item.native?.authorName?.split(",")[0]?.trim();
    const tagged = (item.tags ?? []).find(
      (tag) =>
        !["live", "developer-community"].includes(tag) &&
        !tag.startsWith("evidence:") &&
        !["friction", "adoption", "workflow-shift", "migration", "unexpected-use"].includes(
          tag
        )
    );
    return (product || tagged || "community").toLowerCase();
  }
  if (role === "CAPABILITY") {
    return (
      item.researchPaper?.arxivId ||
      item.native?.authorName?.split(",")[0]?.trim() ||
      item.id
    ).toLowerCase();
  }
  return item.source;
}

export function topicOf(item: FeedItem): string {
  const role = assignRole(item);
  const text = `${item.title} ${item.summary} ${item.native?.subtitle ?? ""}`.toLowerCase();
  if (role === "SUPPLY") {
    const model = item.officialLaunch?.model || item.officialLaunch?.product;
    if (model) return model.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const match = text.match(
      /\b(gpt[-\s]?\d|claude|gemini|grok|llama|qwen|deepseek|minimax|mistral|kimi)\b/i
    );
    return match?.[1]?.toLowerCase() || "launch";
  }
  if (role === "ADOPTION") {
    const tagged = [
      "mcp-runtime",
      "session-failure",
      "tool-calling",
      "install-platform",
    ].find((topic) => (item.tags ?? []).includes(topic));
    if (tagged) return tagged;
    if (/\bmcp\b/.test(text)) return "mcp";
    if (/\bsession\b/.test(text)) return "session";
    if (/\btool call/.test(text)) return "tool-calling";
    if (/\binstall\b/.test(text)) return "install";
    return "adoption";
  }
  if (/\bmemory\b/.test(text)) return "memory";
  if (/\bskill\b/.test(text)) return "skill";
  if (/\bhci\b|harassment|safety vs/.test(text)) return "hci";
  if (/\bvideo\b/.test(text)) return "video";
  if (/\bvoice\b/.test(text)) return "voice";
  if (/\bagent\b/.test(text)) return "agents";
  return item.researchPaper?.relevanceCue?.toLowerCase() || "paper";
}
