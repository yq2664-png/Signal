import {
  AVAILABILITY_CUE,
  RELEASE_CUE,
} from "@/lib/live/official-launch/extract";
import {
  composeEnrichmentSummary,
  defaultFetchEnrichmentHtml,
  parseEnrichmentHtml,
  type EnrichmentFetchHtml,
} from "@/lib/live/official-launch/enrich";
import {
  FACTUAL_ONLY_NOTICE,
  NONE_BRIEF_NOTICE,
  resolveBriefReadiness,
} from "@/lib/live/normalize";
import type {
  BriefReadiness,
  OfficialLaunchEntities,
  OfficialLaunchEvent,
} from "@/lib/types";

export { FACTUAL_ONLY_NOTICE, NONE_BRIEF_NOTICE, resolveBriefReadiness };

export type BriefReadinessReason =
  | "sufficient-evidence"
  | "recovered-from-primary"
  | "default-full"
  | "title-equals-summary"
  | "thin-title-only"
  | "name-only"
  | "marketing-only"
  | "no-concrete-change"
  | "primary-fetch-failed"
  | "primary-parse-failed"
  | "primary-insufficient"
  | "x-feed-only";

export type BriefReadinessAssessment = {
  readiness: BriefReadiness;
  reason: BriefReadinessReason;
};

const PARAMETER_OR_CONTEXT_CUE =
  /\b(?:\d+(?:\.\d+)?\s*[tbm](?:illion)?(?:-|\s+)(?:parameter|param)|\d+(?:\.\d+)?[tbm](?:-|\s*)(?:parameter|param|class)|open\s+\d+t|[tbm]-param|\d[\d,]*\s*(?:billion|trillion)\s+parameter|\d+(?:k|m| million)?[- ]token|\d+-million-token|context window)\b/i;

const BENCHMARK_CUE =
  /\b(?:benchmark|sota|state-of-the-art|swe-bench|livecodebench|gpqa|mmlu|arena score|\bevals?\b)\b/i;

const API_ACCESS_CUE =
  /\b(?:\bapi\b|sdk|playground|download(?:able)?(?:\s+full)?\s+weights|open[- ]weights|api access)\b/i;

const CAPABILITY_CHANGE_CUE =
  /\b(?:native vision|vision capabilit|multimodal|tool[- ]use|function call(?:ing)?|long context|open[- ]weights|open[- ]source)\b/i;

const MARKETING_CUE =
  /\b(?:aims to|designed to|unlock(?:s|ing)?|new opportunities|significant advancement|next-generation|redefin(?:e|es|ing)|empower(?:s|ing)?|cutting-edge|world-class|best-in-class|transform(?:s|ing)? the way|explore the)\b/i;

const FILLER_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "our",
  "new",
  "model",
  "update",
  "and",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
]);

function tokens(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenList(value: string): string[] {
  return tokens(value).split(/\s+/).filter(Boolean);
}

function namedEntityValues(entities?: OfficialLaunchEntities): string[] {
  return [entities?.product, entities?.model].filter(
    (value): value is string => Boolean(value?.trim())
  );
}

function hasNamedProduct(
  title: string,
  summary: string,
  entities?: OfficialLaunchEntities
): boolean {
  if (namedEntityValues(entities).length > 0) return true;
  const hay = `${title} ${summary}`;
  return /\b(?:gpt|claude|gemini|kimi|qwen|llama|minimax|deepseek|o\d)[-.\w]*\b/i.test(
    hay
  );
}

function hasConcreteChange(text: string): boolean {
  return (
    RELEASE_CUE.test(text) ||
    AVAILABILITY_CUE.test(text) ||
    PARAMETER_OR_CONTEXT_CUE.test(text) ||
    BENCHMARK_CUE.test(text) ||
    API_ACCESS_CUE.test(text) ||
    CAPABILITY_CHANGE_CUE.test(text)
  );
}

function isNameOnly(
  summary: string,
  title: string,
  entities?: OfficialLaunchEntities
): boolean {
  const summaryTokens = tokens(summary);
  if (!summaryTokens) return true;
  const names = [...namedEntityValues(entities), title].map(tokens);
  return names.some((name) => name && summaryTokens === name);
}

function addsBeyondTitle(
  title: string,
  summary: string,
  entities?: OfficialLaunchEntities
): boolean {
  const summaryTokens = tokenList(summary);
  if (summaryTokens.length === 0) return false;
  const titleTokens = new Set(tokenList(title));
  const nameTokens = new Set(
    namedEntityValues(entities).flatMap((name) => tokenList(name))
  );
  const extra = summaryTokens.filter(
    (word) =>
      !titleTokens.has(word) && !nameTokens.has(word) && !FILLER_WORDS.has(word)
  );
  return extra.length > 0;
}

function assessEvidence(
  title: string,
  summary: string,
  entities?: OfficialLaunchEntities
): BriefReadinessAssessment {
  const titleNorm = tokens(title);
  const summaryNorm = tokens(summary);

  if (!summaryNorm) {
    return { readiness: "factual-only", reason: "thin-title-only" };
  }
  if (summaryNorm === titleNorm) {
    return { readiness: "factual-only", reason: "title-equals-summary" };
  }
  if (isNameOnly(summary, title, entities)) {
    return { readiness: "factual-only", reason: "name-only" };
  }
  if (!hasNamedProduct(title, summary, entities)) {
    return { readiness: "factual-only", reason: "name-only" };
  }
  if (!hasConcreteChange(`${title} ${summary}`)) {
    if (MARKETING_CUE.test(summary) || MARKETING_CUE.test(title)) {
      return { readiness: "factual-only", reason: "marketing-only" };
    }
    return { readiness: "factual-only", reason: "no-concrete-change" };
  }
  if (!addsBeyondTitle(title, summary, entities)) {
    return { readiness: "factual-only", reason: "title-equals-summary" };
  }
  return { readiness: "full", reason: "sufficient-evidence" };
}

export function assessBriefReadiness(input: {
  title: string;
  summary: string;
  entities?: OfficialLaunchEntities;
  briefEligible?: boolean;
}): BriefReadinessAssessment {
  if (input.briefEligible === false) {
    return { readiness: "none", reason: "x-feed-only" };
  }
  return assessEvidence(input.title, input.summary, input.entities);
}

export async function recoverOfficialLaunchEvidence(
  event: OfficialLaunchEvent,
  fetchHtml: EnrichmentFetchHtml = defaultFetchEnrichmentHtml
): Promise<{
  summary: string;
  recovered: boolean;
  fetched: boolean;
  assessment: BriefReadinessAssessment;
}> {
  const initial = assessEvidence(
    event.title,
    event.summary,
    event.entities
  );
  if (initial.readiness === "full") {
    return {
      summary: event.summary,
      recovered: false,
      fetched: false,
      assessment: initial,
    };
  }

  const url = event.primarySource.url?.trim();
  if (!url) {
    return {
      summary: event.summary,
      recovered: false,
      fetched: false,
      assessment: { readiness: "factual-only", reason: "primary-fetch-failed" },
    };
  }

  try {
    const response = await fetchHtml(url);
    if (response.status >= 400 || !response.body?.trim()) {
      return {
        summary: event.summary,
        recovered: false,
        fetched: true,
        assessment: {
          readiness: "factual-only",
          reason: "primary-fetch-failed",
        },
      };
    }
    const parsed = parseEnrichmentHtml(response.body);
    if (!parsed?.text) {
      return {
        summary: event.summary,
        recovered: false,
        fetched: true,
        assessment: {
          readiness: "factual-only",
          reason: "primary-parse-failed",
        },
      };
    }
    const recoveredText =
      composeEnrichmentSummary(parsed, {
        listingTitle: event.title,
        seekAvailability: true,
      }) || parsed.text;
    const reassessment = assessEvidence(
      event.title,
      recoveredText,
      event.entities
    );
    if (reassessment.readiness === "full") {
      return {
        summary: recoveredText,
        recovered: true,
        fetched: true,
        assessment: {
          readiness: "full",
          reason: "recovered-from-primary",
        },
      };
    }
    return {
      summary: event.summary,
      recovered: false,
      fetched: true,
      assessment: {
        readiness: "factual-only",
        reason: "primary-insufficient",
      },
    };
  } catch {
    return {
      summary: event.summary,
      recovered: false,
      fetched: true,
      assessment: {
        readiness: "factual-only",
        reason: "primary-fetch-failed",
      },
    };
  }
}
