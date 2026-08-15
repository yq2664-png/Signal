import type { FeedItem } from "@/lib/types";
import type { RankedFeed } from "@/lib/live/ranking/rank";
import { organizationOf } from "@/lib/live/ranking/identity";

/**
 * Move a liked/saved item at most one seat up, only within the same
 * attention class. Never crosses HIGH/MEDIUM. Never creates same-org
 * adjacency. Does not re-rank the Feed.
 */
export function applyIntraClassPreference(
  ranked: RankedFeed,
  preferredIds: Set<string>
): RankedFeed {
  if (preferredIds.size === 0) return ranked;
  const items = [...ranked.items];
  const annotations = ranked.annotations.map((row) => ({ ...row }));
  const byId = new Map(annotations.map((row) => [row.id, row]));

  for (let index = 1; index < items.length; index += 1) {
    const current = items[index];
    const previous = items[index - 1];
    if (!preferredIds.has(current.id) || preferredIds.has(previous.id)) continue;
    const currentAnn = byId.get(current.id);
    const previousAnn = byId.get(previous.id);
    if (!currentAnn || !previousAnn) continue;
    if (currentAnn.attentionClass !== previousAnn.attentionClass) continue;
    if (currentAnn.attentionClass === "BACKGROUND") continue;
    if (organizationOf(current) === organizationOf(previous)) continue;
    const afterPrev = items[index - 2];
    if (afterPrev && organizationOf(current) === organizationOf(afterPrev)) {
      continue;
    }
    items[index - 1] = current;
    items[index] = previous;
    currentAnn.preferenceShift = 1;
    currentAnn.diversityRules = [
      ...currentAnn.diversityRules,
      "preference-tie-break",
    ];
    break;
  }

  return { items, annotations };
}

export function preferredIdsFromItems(items: FeedItem[]): Set<string> {
  return new Set(items.map((item) => item.id));
}
