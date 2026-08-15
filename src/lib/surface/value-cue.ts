import type { RankedFeed } from "@/lib/live/ranking";
import { assignRole } from "@/lib/live/ranking/role";
import type { FeedItem, ValueCue } from "@/lib/types";
import type { FeedRole } from "@/lib/live/ranking/config";

export function valueCueForRole(role: FeedRole): ValueCue | undefined {
  if (role === "SUPPLY") return "High Impact";
  if (role === "CAPABILITY") return "New Capability";
  if (role === "ADOPTION") return "Developer Signal";
  return undefined;
}

/**
 * Stamp user-facing value cues onto ranked items.
 * Preserves API order exactly. Does not call rankUnifiedFeed.
 */
export function attachValueCues(ranked: RankedFeed): FeedItem[] {
  const roleById = new Map(
    ranked.annotations.map((row) => [row.id, row.role] as const)
  );
  return ranked.items.map((item) => {
    const role = roleById.get(item.id) ?? assignRole(item);
    const valueCue = valueCueForRole(role);
    return valueCue ? { ...item, valueCue } : item;
  });
}
