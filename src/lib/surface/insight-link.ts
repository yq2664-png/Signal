import type { FeedItem, Insight, InsightRole } from "@/lib/types";

function idsMatch(itemId: string, objectId: string): boolean {
  if (itemId === objectId) return true;
  if (itemId === `dc-${objectId}`) return true;
  if (objectId === `dc-${itemId}`) return true;
  return false;
}

export function insightForItem(
  item: FeedItem,
  insights: Insight[]
): Insight | undefined {
  return insights.find((insight) =>
    insight.evidence.some((row) => idsMatch(item.id, row.objectId))
  );
}

export function evidenceRoleLabel(role: InsightRole): string {
  if (role === "SUPPLY") return "Launch";
  if (role === "CAPABILITY") return "Research";
  return "In the wild";
}
