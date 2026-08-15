import type { ImpactBrief } from "@/lib/types";

const TEMPLATE_WHY =
  /ingested from a trusted source feed|structured triage template/i;
const TEMPLATE_TAKE = /skim the source, then decide/i;
const AUTHOR_EVIDENCE =
  /\s*\d+\s+independent authors across\s+\d+\s+evidence records\.?/gi;
const URLS = /https?:\/\/\S+/gi;

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function overlap(left: string, right: string): boolean {
  const a = norm(left);
  const b = norm(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 24 && b.includes(a)) return true;
  if (b.length >= 24 && a.includes(b)) return true;
  return false;
}

function clean(text: string): string {
  return text.replace(URLS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Display-level Brief shaping. Does not change stored or pipeline copy.
 */
export function presentBrief(brief: ImpactBrief): ImpactBrief {
  const whatHappened = clean(
    brief.whatHappened.replace(AUTHOR_EVIDENCE, " ")
  );
  let whyItMatters = clean(brief.whyItMatters);
  let potentialImpact = clean(brief.potentialImpact);
  let keyTakeaway = clean(brief.keyTakeaway);

  if (TEMPLATE_WHY.test(whyItMatters)) whyItMatters = "";
  if (TEMPLATE_TAKE.test(keyTakeaway)) keyTakeaway = "";

  if (whyItMatters && overlap(whyItMatters, whatHappened)) whyItMatters = "";
  if (
    potentialImpact &&
    (overlap(potentialImpact, whatHappened) ||
      overlap(potentialImpact, whyItMatters))
  ) {
    potentialImpact = "";
  }
  if (
    keyTakeaway &&
    (overlap(keyTakeaway, whatHappened) ||
      overlap(keyTakeaway, whyItMatters) ||
      overlap(keyTakeaway, potentialImpact))
  ) {
    keyTakeaway = "";
  }

  return {
    whatHappened: whatHappened || clean(brief.whatHappened),
    whyItMatters,
    potentialImpact,
    keyTakeaway,
  };
}
