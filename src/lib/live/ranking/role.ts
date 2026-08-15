import type { FeedItem } from "@/lib/types";
import type { FeedRole } from "@/lib/live/ranking/config";

export function isDisqualified(item: FeedItem): boolean {
  const tags = item.tags ?? [];
  return tags.some((tag) =>
    /^(watch|fail|borderline|review-queue|excluded)$/i.test(tag)
  );
}

export function assignRole(item: FeedItem): FeedRole {
  if (item.officialLaunch || (item.tags ?? []).includes("official-launch")) {
    return "SUPPLY";
  }
  if (item.researchPaper || (item.tags ?? []).includes("research-paper")) {
    return "CAPABILITY";
  }
  if (
    item.source === "Developer Community" ||
    (item.tags ?? []).includes("developer-community")
  ) {
    return "ADOPTION";
  }
  return "BACKGROUND";
}
