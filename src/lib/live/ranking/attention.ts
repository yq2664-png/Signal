import type { FeedItem } from "@/lib/types";
import type { AttentionClass } from "@/lib/live/ranking/config";
import { assignBusinessTier } from "@/lib/live/ranking/business-tier";
import { assignRole, isDisqualified } from "@/lib/live/ranking/role";

const PRODUCT_CAPABILITY =
  /\b(memory|agent|skill|hci|safety|ux|product design|workflow|session)\b/i;

export function isBreakingSupply(item: FeedItem): boolean {
  return assignBusinessTier(item) === "T1";
}

export function assignAttentionClass(item: FeedItem): AttentionClass {
  if (isDisqualified(item)) return "BACKGROUND";
  const role = assignRole(item);
  if (role === "BACKGROUND") return "BACKGROUND";

  if (role === "SUPPLY") {
    const tier = assignBusinessTier(item);
    if (tier === "T1" || tier === "T2") return "HIGH";
    return "MEDIUM";
  }

  if (role === "CAPABILITY") {
    const cue = item.researchPaper?.relevanceCue ?? "";
    const text = `${item.title} ${item.summary} ${cue} ${item.native?.subtitle ?? ""}`;
    if (
      cue === "Agent memory" ||
      cue === "Agents" ||
      cue === "HCI" ||
      PRODUCT_CAPABILITY.test(text)
    ) {
      return "HIGH";
    }
    return "MEDIUM";
  }

  if (role === "ADOPTION") {
    return "HIGH";
  }

  return "BACKGROUND";
}
