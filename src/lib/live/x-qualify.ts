export type XQualifyDecision = "reject" | "feed-only" | "feed-brief";

export type XQualifyReason =
  | "promo-spam"
  | "keyword-stuffing"
  | "generic-commentary"
  | "too-thin"
  | "ambiguous-entity"
  | "conversational-noise"
  | "insufficient-evidence"
  | "concrete-shipping"
  | "first-hand-implementation"
  | "measurable-result"
  | "reproducible-behavior";

export type XQualifyVerdict = {
  decision: XQualifyDecision;
  reason: XQualifyReason;
};

export type XQualifyContext = {
  isReply?: boolean;
};

const UNAMBIGUOUS_ENTITY =
  /\b(chatgpt|gpt-4o(?:-\w+)?|gpt(?:-[\w.]+)?|openai|anthropic|copilot|llama-?\d*|deepseek|qwen|kimi|minimax|mistral|midjourney|sora|o[13](?:-mini)?)\b/i;

const CLAUDE_TOKEN = /\bclaude\b/i;
const GEMINI_TOKEN = /\bgemini\b/i;
const GROK_TOKEN = /\bgrok\b/i;

const CLAUDE_CONTEXT =
  /\b(anthropic|claude code|claude api|claude (?:sonnet|opus|haiku|\d)|llm|llms|agent|agents|mcp|ai model|context window|tool[- ]call|tool calling|prompt|inference|benchmark|coding assistant)\b/i;

const GEMINI_CONTEXT =
  /\b(google|deepmind|gemini api|gemini (?:flash|pro|\d)|llm|llms|multimodal|agent|agents|ai|benchmark|context window|flash|pro)\b/i;

const GROK_CONTEXT =
  /\b(xai|grok api|grok-\d|grok (?:model|api)|benchmark|shipped|released|latency|context window|in prod|production)\b/i;

const CLAUDE_PERSON =
  /\bclaude\s+(jarman|monet|debussy|rains|shannon|von|van)\b/i;

const CLAUDE_UNRELATED =
  /\b(blu[- ]?ray|blue[- ]?light|blue light|glasses|imdb|\bcast\b|western)\b/i;

const GEMINI_ZODIAC =
  /\b(horoscope|astrology|zodiac|star sign|rising sign|mercury retrograde|gemini season|sun in gemini)\b/i;

const ZODIAC_SIGN =
  /\b(aries|taurus|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i;

const AI_SIGNAL =
  /\b(ai|llm|llms|machine learning|foundation model|agent|agents|mcp|tool[- ]call|tool calling)\b/i;

const BUNDLE_BRAND =
  /\b(grammarly|spotify|netflix|disney\+|hulu|canva(?:\s+pro)?|nordvpn|youtube premium|adobe)\b/i;

const PROMO =
  /\b(giveaway|coupon|discount code|limited offer|link in bio|click here|only \$\d|crypto signal|forex|\d+%\s+off|save \d+%)\b/i;

const DM_BAIT =
  /\b(follow me|dm me|dm\s*["“']|subscribe)\b/i;

const PREMIUM_BAIT =
  /\b(premium help you|chatgpt plus|claude pro|gemini advanced)\b/i;

const GENERIC_COMMENTARY =
  /\b(ai|llms?|agents?)\b[\s\S]{0,48}\b(changing everything|the future|overhyped|here to stay|going to change the world|is dead|is amazing)\b/i;

const HOT_TAKE = /^(hot take|unpopular opinion)\b/i;

const SENTIMENT_ONLY =
  /\b(looks? interesting|looks? much better|feels? faster|so good|pretty good|love it|amazing|impressive|underrated|overrated|nice|cool)\b|\blol\b|\blmao\b/i;

const BRAND_ARGUMENT =
  /\b(sucks?|clears?|mid\b|trash|overhyped|destroyed|owned)\b/i;

const GROK_QUESTION =
  /\b(what do you think|can you|do you think|tell me|explain this)\b/i;

const MEASUREMENT =
  /\b\d+(?:\.\d+)?\s*(%|ms|s|sec|seconds|tokens?)\b|\bdropped from\b|\bfrom \d+(?:\.\d+)?%?\s*(?:to|→|->)\s*\d+(?:\.\d+)?%?\b|\b(?:fell|dropped|reduced|cut)\s+\d+(?:\.\d+)?%?\b|\bp95\b|\bp50\b|\bp99\b|\bcost per\b|\bbefore\/after\b|\bbefore and after\b/i;

const EVENT =
  /\b(shipped|launched|released|migrating|migrated|announc(?:ed|ing)|introduced|rolled out|enabled|fixed|now (?:keeps|supports|adds|exposes)|available|api is live)\b|\bnew:/i;

const IMPLEMENTATION =
  /\b(workflow|tool[- ]call|tool calling|mcp|schema|reconnect|mid-turn|in prod|production|latency|batching|agent workflow|implementation|support agent)\b/i;

const FIRST_HAND =
  /\b(after migrating|after switching|after upgrading|here is what changed|tested it|we (?:stopped|switched|moved|pinned|measured|migrated|tested|deployed|shipped)|in prod today)\b/i;

const REPRO = /\b(repro|steps to reproduce|reproducible)\b/i;

const BRAND_TOKEN =
  /\b(chatgpt|claude|gemini|openai|anthropic|gpt-?\d+(?:\.\d+)?|copilot|ai tools)\b/gi;

export function shouldPublishXToFeed(verdict: XQualifyVerdict): boolean {
  return verdict.decision === "feed-brief";
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function looksLikeReply(text: string, context?: XQualifyContext): boolean {
  return Boolean(context?.isReply) || /^@\w+/.test(text);
}

function isClaudePerson(text: string): boolean {
  return CLAUDE_PERSON.test(text) || (CLAUDE_TOKEN.test(text) && CLAUDE_UNRELATED.test(text));
}

function isGeminiAstrology(text: string): boolean {
  if (!GEMINI_TOKEN.test(text)) return false;
  return GEMINI_ZODIAC.test(text) || ZODIAC_SIGN.test(text);
}

function hasClaudeSignal(text: string): boolean {
  if (!CLAUDE_TOKEN.test(text) || isClaudePerson(text)) return false;
  return CLAUDE_CONTEXT.test(text);
}

function hasGeminiSignal(text: string): boolean {
  if (!GEMINI_TOKEN.test(text) || isGeminiAstrology(text)) return false;
  return GEMINI_CONTEXT.test(text);
}

function hasGrokSignal(text: string): boolean {
  if (!GROK_TOKEN.test(text)) return false;
  return GROK_CONTEXT.test(text);
}

function hasNamedEntity(text: string): boolean {
  return (
    UNAMBIGUOUS_ENTITY.test(text) ||
    hasClaudeSignal(text) ||
    hasGeminiSignal(text) ||
    hasGrokSignal(text)
  );
}

function isAiRelevant(text: string): boolean {
  return hasNamedEntity(text) || AI_SIGNAL.test(text);
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
    (firstHand && (event || implementation || measurement))
  );
}

function concreteReason(text: string): XQualifyReason {
  if (REPRO.test(text)) return "reproducible-behavior";
  const measurement = MEASUREMENT.test(text);
  const firstHand = FIRST_HAND.test(text);
  const event = EVENT.test(text);
  if (firstHand && measurement) return "first-hand-implementation";
  if (measurement) return "measurable-result";
  if (firstHand) return "first-hand-implementation";
  if (event) return "concrete-shipping";
  return "first-hand-implementation";
}

function isPromoSpam(text: string): boolean {
  if (PROMO.test(text)) return true;
  if (/\bpremium help you\b/i.test(text)) return true;
  if (BUNDLE_BRAND.test(text) && (hasNamedEntity(text) || AI_SIGNAL.test(text))) {
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

function isBrandArgument(text: string): boolean {
  if (hasConcreteEvidence(text)) return false;
  const brands = text.match(BRAND_TOKEN) ?? [];
  const unique = new Set(brands.map((match) => match.toLowerCase()));
  return unique.size >= 2 && BRAND_ARGUMENT.test(text);
}

function isCasualGrok(text: string, context?: XQualifyContext): boolean {
  if (!GROK_TOKEN.test(text)) return false;
  if (hasConcreteEvidence(text) || hasGrokSignal(text)) return false;
  if (/^@grok\b/i.test(text)) return true;
  if (GROK_QUESTION.test(text)) return true;
  if (looksLikeReply(text, context) && words(text).length <= 24) return true;
  return !hasGrokSignal(text);
}

function isConversationalNoise(text: string, context?: XQualifyContext): boolean {
  if (hasConcreteEvidence(text)) return false;
  if (isCasualGrok(text, context)) return true;
  if (isBrandArgument(text)) return true;
  if (looksLikeReply(text, context) && words(text).length <= 12 && !hasConcreteEvidence(text)) {
    return true;
  }
  return false;
}

/**
 * Source-specific X qualification. Engagement / follower counts are not inputs.
 */
export function qualifyXPost(
  raw: string,
  context: XQualifyContext = {}
): XQualifyVerdict {
  const text = normalize(raw);
  if (!text) {
    return { decision: "reject", reason: "too-thin" };
  }

  if (isClaudePerson(text) || isGeminiAstrology(text)) {
    return { decision: "reject", reason: "ambiguous-entity" };
  }

  if (isPromoSpam(text)) {
    return { decision: "reject", reason: "promo-spam" };
  }

  if (isConversationalNoise(text, context)) {
    return { decision: "reject", reason: "conversational-noise" };
  }

  if (!isAiRelevant(text)) {
    if (CLAUDE_TOKEN.test(text) || GEMINI_TOKEN.test(text) || GROK_TOKEN.test(text)) {
      return { decision: "reject", reason: "ambiguous-entity" };
    }
    return { decision: "reject", reason: "too-thin" };
  }

  if (hasConcreteEvidence(text) && isAiRelevant(text)) {
    return {
      decision: "feed-brief",
      reason: concreteReason(text),
    };
  }

  if (isKeywordStuffing(text)) {
    return { decision: "reject", reason: "keyword-stuffing" };
  }

  if (isGenericCommentary(text)) {
    return { decision: "reject", reason: "generic-commentary" };
  }

  if (hasNamedEntity(text)) {
    return {
      decision: "feed-only",
      reason: "insufficient-evidence",
    };
  }

  if (SENTIMENT_ONLY.test(text) || looksLikeReply(text, context)) {
    return { decision: "reject", reason: "conversational-noise" };
  }

  return { decision: "reject", reason: "too-thin" };
}
