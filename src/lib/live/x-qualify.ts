export type XQualifyDecision = "reject" | "feed-only" | "feed-brief";

export type XQualifyReason =
  | "promo-spam"
  | "keyword-stuffing"
  | "generic-commentary"
  | "too-thin"
  | "named-entity-insufficient-evidence"
  | "concrete-evidence";

export type XQualifyVerdict = {
  decision: XQualifyDecision;
  reason: XQualifyReason;
};

const NAMED_ENTITY =
  /\b(chatgpt|gpt-4o(?:-\w+)?|gpt-?\d+(?:\.\d+)?(?:-\w+)?|claude(?:\s+code)?|gemini(?:\s+advanced)?|openai|anthropic|copilot|llama-?\d*|deepseek|qwen|kimi|minimax|mistral|grok|midjourney|sora|o[13](?:-mini)?)\b/i;

const AI_SIGNAL =
  /\b(ai|llm|llms|machine learning|foundation model|agent|agents|mcp|tool[- ]call|tool calling)\b/i;

const BUNDLE_BRAND =
  /\b(grammarly|spotify|netflix|disney\+|hulu|canva(?:\s+pro)?|nordvpn|youtube premium|adobe)\b/i;

const PROMO =
  /\b(giveaway|coupon|discount code|limited offer|link in bio|click here|only \$\d|crypto signal|forex)\b/i;

const DM_BAIT =
  /\b(follow me|dm me|dm\s*["“']|subscribe)\b/i;

const PREMIUM_BAIT =
  /\b(premium help you|chatgpt plus|claude pro|gemini advanced)\b/i;

const GENERIC_COMMENTARY =
  /\b(ai|llms?|agents?)\b[\s\S]{0,48}\b(changing everything|the future|overhyped|here to stay|going to change the world|is dead|is amazing)\b/i;

const HOT_TAKE = /^(hot take|unpopular opinion)\b/i;

const SENTIMENT_ONLY =
  /\b(looks? interesting|so good|pretty good|love it|amazing|underrated|overrated|nice|cool)\b|\blol\b|\blmao\b/i;

const MEASUREMENT =
  /\b\d+(?:\.\d+)?\s*(%|ms|s|sec|seconds|tokens?)\b|\bdropped from\b|\bfrom \d+(?:\.\d+)?%?\s+to \d+(?:\.\d+)?%?\b|\bp95\b|\bp50\b|\bp99\b/i;

const EVENT =
  /\b(shipped|launched|released|migrating|migrated|announc(?:ed|ing)|introduced|rolled out|enabled|fixed|now (?:keeps|supports|adds)|available)\b|\bnew:/i;

const IMPLEMENTATION =
  /\b(workflow|tool[- ]call|tool calling|mcp|schema|reconnect|mid-turn|in prod|production|latency|batching|agent workflow|implementation)\b/i;

const FIRST_HAND =
  /\b(after migrating|here is what changed|we (?:stopped|switched|moved|pinned|measured)|in prod today)\b/i;

const REPRO = /\b(repro|steps to reproduce|reproducible)\b/i;

const BRAND_TOKEN =
  /\b(chatgpt|claude|gemini|openai|anthropic|gpt-?\d+(?:\.\d+)?|copilot|ai tools)\b/gi;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function isAiRelevant(text: string): boolean {
  return NAMED_ENTITY.test(text) || AI_SIGNAL.test(text);
}

function hasNamedEntity(text: string): boolean {
  return NAMED_ENTITY.test(text);
}

function hasConcreteEvidence(text: string): boolean {
  const measurement = MEASUREMENT.test(text);
  const event = EVENT.test(text);
  const implementation = IMPLEMENTATION.test(text);
  const firstHand = FIRST_HAND.test(text);
  const repro = REPRO.test(text);
  return (
    repro ||
    (measurement && (event || implementation || firstHand)) ||
    (event && implementation) ||
    (firstHand && (event || implementation))
  );
}

function isPromoSpam(text: string): boolean {
  if (PROMO.test(text)) return true;
  if (/\bpremium help you\b/i.test(text)) return true;
  if (BUNDLE_BRAND.test(text) && (NAMED_ENTITY.test(text) || AI_SIGNAL.test(text))) {
    return true;
  }
  if (DM_BAIT.test(text) && PREMIUM_BAIT.test(text)) return true;
  if (DM_BAIT.test(text) && /\b(free|plus|pro|premium)\b/i.test(text)) return true;
  if (PREMIUM_BAIT.test(text) && /\b(free|giveaway|dm|follow)\b/i.test(text)) {
    return true;
  }
  return false;
}

function isKeywordStuffing(text: string): boolean {
  if (hasConcreteEvidence(text)) return false;
  const matches = text.match(BRAND_TOKEN) ?? [];
  const unique = new Set(matches.map((match) => match.toLowerCase()));
  const tokenCount = words(text).length;
  if (matches.length >= 4 && unique.size >= 2) return true;
  if (matches.length >= 3 && tokenCount <= 12) return true;
  return false;
}

function isGenericCommentary(text: string): boolean {
  if (hasConcreteEvidence(text)) return false;
  if (GENERIC_COMMENTARY.test(text)) return true;
  if (HOT_TAKE.test(text) && !hasNamedEntity(text)) return true;
  return false;
}

/**
 * Source-specific X qualification. Engagement / follower counts are not inputs.
 */
export function qualifyXPost(raw: string): XQualifyVerdict {
  const text = normalize(raw);
  if (!text) {
    return { decision: "reject", reason: "too-thin" };
  }

  if (isPromoSpam(text)) {
    return { decision: "reject", reason: "promo-spam" };
  }

  if (!isAiRelevant(text)) {
    return { decision: "reject", reason: "too-thin" };
  }

  if (hasConcreteEvidence(text)) {
    return { decision: "feed-brief", reason: "concrete-evidence" };
  }

  if (isKeywordStuffing(text)) {
    return { decision: "reject", reason: "keyword-stuffing" };
  }

  if (isGenericCommentary(text)) {
    return { decision: "reject", reason: "generic-commentary" };
  }

  if (hasNamedEntity(text) && (SENTIMENT_ONLY.test(text) || words(text).length <= 12)) {
    return {
      decision: "feed-only",
      reason: "named-entity-insufficient-evidence",
    };
  }

  if (hasNamedEntity(text) && !hasConcreteEvidence(text)) {
    return {
      decision: "feed-only",
      reason: "named-entity-insufficient-evidence",
    };
  }

  return { decision: "reject", reason: "too-thin" };
}
