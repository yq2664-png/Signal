import type { FeedItem } from "@/lib/types";
import { assignRole } from "@/lib/live/ranking/role";

export type BusinessTier = "T1" | "T2";

const RESIDUE_TITLE = /^(announcements?|latest(?:\s+ai)?\s+news)$/i;
const RECAP =
  /\b(recap|roundup|latest ai news|ai news we announced|what we (?:shipped|announced|launched) in|monthly (?:ai )?update)\b/i;
const CHANGELOG =
  /\b(changelog|release notes|patch release|bug ?fix(?:es)?|minor (?:update|release)|price cut|costs \d|\d+%\s*(?:less|cheaper))\b/i;
const GENERIC_OSS_PROJECT =
  /\b(toolkit|framework|library|sdk|plugin|extension|repo(?:sitory)?)\b/i;
const PRODUCT_SHAPE =
  /\b(bots?|build mode|studio|copilot|managed agents|toolkit|plugin|extension)\b/i;
const FOUNDATION_MODEL_FAMILY =
  /\b(gpt-?\d|gpt\b|claude|gemini|gemma|grok|kimi|qwen[-\d]*|llama|mistral|mixtral|deepseek|minimax|sonnet|opus|haiku|inkling|lyria|muse spark|o[1-4]\b)\b/i;
const GUARD_PRODUCT = /\b(guard|shield)\b/i;
const FOUNDATION_MODEL_PHRASE =
  /\b(foundation model|language model|frontier model|open[- ]weights?(?: model)?|model family)\b/i;
const MODEL_AVAILABLE =
  /\b(introduc(?:e|es|ed|ing)|released?|launch(?:es|ed|ing)?|now available|generally available|available today)\b/i;

function supplyText(item: FeedItem): string {
  return [
    item.title,
    item.summary,
    item.officialLaunch?.model,
    item.officialLaunch?.product,
    item.officialLaunch?.version,
  ]
    .filter(Boolean)
    .join(" ");
}

function modelCueText(item: FeedItem): string {
  return [item.title, item.officialLaunch?.model, item.officialLaunch?.version]
    .filter(Boolean)
    .join(" ");
}

export function isSupplyResidue(item: FeedItem): boolean {
  const title = item.title.trim();
  if (RESIDUE_TITLE.test(title)) return true;
  const text = `${item.title} ${item.summary}`;
  return RECAP.test(text) || CHANGELOG.test(title);
}

function hasFoundationFamily(text: string): boolean {
  return FOUNDATION_MODEL_FAMILY.test(text);
}

function isGenericOpenSourceProject(item: FeedItem): boolean {
  const eventType = item.officialLaunch?.eventType;
  if (eventType !== "open-source-release") return false;
  if (isVersionedFoundationModel(item)) return false;
  const text = supplyText(item);
  return GENERIC_OSS_PROJECT.test(text) || !item.officialLaunch?.model?.trim();
}

function isVersionedFoundationModel(item: FeedItem): boolean {
  if (PRODUCT_SHAPE.test(item.title)) return false;
  const model = item.officialLaunch?.model?.trim() ?? "";
  if (GUARD_PRODUCT.test(item.title) && !(model && hasFoundationFamily(model) && /\d/.test(model))) {
    return false;
  }
  if (model && hasFoundationFamily(model)) return true;
  const text = modelCueText(item);
  if (FOUNDATION_MODEL_PHRASE.test(text) && hasFoundationFamily(text)) return true;
  if (FOUNDATION_MODEL_PHRASE.test(supplyText(item)) && Boolean(model) && hasFoundationFamily(model)) {
    return true;
  }
  if (!hasFoundationFamily(text)) return false;
  return MODEL_AVAILABLE.test(item.title) || Boolean(model);
}

/**
 * Ranking-only Supply classification. Does not change Official Launch
 * qualification. T1 = a foundation model became available. T2 = a
 * first-party Official Launch product. Never assigned to Capability,
 * Adoption, or BACKGROUND connectors.
 */
export function assignBusinessTier(item: FeedItem): BusinessTier | undefined {
  if (assignRole(item) !== "SUPPLY") return undefined;
  if (item.source === "Product Hunt") return undefined;
  if (isSupplyResidue(item)) return undefined;

  if (isModelAvailable(item)) return "T1";
  if (isOfficialProductLaunch(item)) return "T2";
  return undefined;
}

export function isModelAvailable(item: FeedItem): boolean {
  if (assignRole(item) !== "SUPPLY") return false;
  if (isSupplyResidue(item)) return false;
  if (isGenericOpenSourceProject(item)) return false;

  const eventType = item.officialLaunch?.eventType;
  if (eventType === "major-update" || eventType === "api-release") return false;
  if (eventType === "product-launch") return false;

  return isVersionedFoundationModel(item);
}

function isOfficialProductLaunch(item: FeedItem): boolean {
  if (assignRole(item) !== "SUPPLY") return false;
  if (isSupplyResidue(item)) return false;
  if (isModelAvailable(item)) return false;
  if (isGenericOpenSourceProject(item)) return false;

  const eventType = item.officialLaunch?.eventType;
  if (eventType === "major-update" || eventType === "api-release") return false;
  if (eventType === "product-launch") return true;
  if (PRODUCT_SHAPE.test(item.title) && MODEL_AVAILABLE.test(item.title)) return true;
  if (GUARD_PRODUCT.test(item.title) && MODEL_AVAILABLE.test(item.title)) return true;
  const product = item.officialLaunch?.product?.trim();
  return Boolean(product) && !isVersionedFoundationModel(item);
}

export function impactOf(item: FeedItem): number {
  if (!item.officialLaunch) return 0;
  const value = item.scores?.impact;
  return Number.isFinite(value) ? value : 0;
}

/** OL maps novelty into scores.trend; used only as a T1/T2 tie-break. */
export function noveltyOf(item: FeedItem): number {
  if (!item.officialLaunch) return 0;
  const value = item.scores?.trend;
  return Number.isFinite(value) ? value : 0;
}
