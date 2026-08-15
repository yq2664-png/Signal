import type { CommunitySignal, ImpactBrief } from "@/lib/types";

export function makeCommunityBrief(signal: CommunitySignal): ImpactBrief {
  const urls = signal.evidence
    .slice(0, 3)
    .map((item) => item.sourceUrl)
    .filter(Boolean);
  const windowDays = Math.max(
    1,
    Math.round(
      (new Date(signal.lastSeenAt).getTime() -
        new Date(signal.firstSeenAt).getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );
  return {
    whatHappened: `${signal.summary} ${signal.uniqueAuthorCount} independent authors across ${signal.evidence.length} evidence records.`,
    whyItMatters: `This is a recurring ${signal.signalType.replaceAll("_", " ").toLowerCase()} pattern over ${windowDays} day(s), not a single complaint.`,
    potentialImpact:
      "Product, UX, or agent-workflow assumptions may need to change around reliability, tool use, or session behavior.",
    keyTakeaway: `Test or watch ${signal.products.join(", ") || "this stack"} against the retained evidence: ${urls.join(" ")}`.slice(
      0,
      320
    ),
  };
}
