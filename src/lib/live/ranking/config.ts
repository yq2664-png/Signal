export const ATTENTION_WINDOW = 10;

export const MAX_CONSECUTIVE_ROLE = 2;

export type FeedRole = "SUPPLY" | "CAPABILITY" | "ADOPTION" | "BACKGROUND";

export type AttentionClass = "HIGH" | "MEDIUM" | "BACKGROUND";

export type RankingLabel =
  | "High Impact"
  | "New Capability"
  | "Developer Signal"
  | "Trending";

export const ROLE_SEED_ORDER: FeedRole[] = [
  "SUPPLY",
  "ADOPTION",
  "CAPABILITY",
];
