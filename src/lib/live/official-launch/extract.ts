import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import type { OfficialLaunchOrganizationConfig } from "@/lib/live/official-launch/config";
import {
  sanitizeDiagnosticError,
  type OfficialLaunchDiagnosticsCollector,
} from "@/lib/live/official-launch/diagnostics";
import type {
  OfficialLaunchEventType,
  OfficialLaunchSourceRecord,
  QualifiedLaunchRecord,
} from "@/lib/types";

const CACHE_FILE = path.join(
  getCacheDir(),
  "official-launch-qualification-v2.json"
);
const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

type Extraction = {
  qualifies: boolean;
  eventType: OfficialLaunchEventType;
  product?: string;
  model?: string;
  version?: string;
  capabilities: string[];
  qualificationScore: number;
  noveltyScore: number;
  impactScore: number;
  confidence: number;
  classifiedAt: string;
};

type ExtractionCache = Record<string, Extraction>;

export const EXCLUDE_CUE =
  /\b(hiring|job opening|join our team|webinar|conference|event|summit|campaign|opinion|essay|interview|podcast|grant|scholarship|partnership|partner(?:ing|ed)? with|investment|acquisition|case study|customer story|our position on|policy proposal|safety update|educators?|students|classroom|curriculum)\b/i;
export const MINOR_CUE =
  /\b(minor (?:update|release|change)|patch release|bug ?fix(?:es)?|documentation update|maintenance (?:update|release)|small update|quality-of-life)\b/i;
export const RELEASE_CUE =
  /\b(introduc(?:e|es|ed|ing)|announc(?:e|es|ed|ing)|launch(?:es|ed|ing)?|releas(?:e|es|ed|ing)|now available|generally available|\bga\b|open[- ]?weights|open[- ]?source|roll(?:ing)? out)\b/i;
export const PRODUCT_CUE =
  /\b(model|api|platform|product|app|agent|assistant|sdk|tool|weights|playground|audio|image|video|reasoning|multimodal|coding)\b/i;
export const AVAILABILITY_CUE =
  /\b(available(?:\s+(?:today|now|to|on|in|for|via))?|api access|api\b|full weights|download(?:able)?|try it|access(?:ible)?|developers can|customers can|users can|all plans|shipping|shipped|released?|launched?|roll(?:ing)? out)\b/i;
const RESEARCH_OR_GENERIC_MODEL_CUE =
  /\b(?:research preview|preview research|[A-Z][A-Za-z0-9.-]+\s+Models?)\b/;

export function hasExplicitLaunchEvidence(text: string): boolean {
  if (!RESEARCH_OR_GENERIC_MODEL_CUE.test(text)) return true;
  return AVAILABILITY_CUE.test(text);
}

function clamp(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number)))
    : fallback;
}

function cacheKey(record: OfficialLaunchSourceRecord): string {
  return createHash("sha256")
    .update(
      `v2|${record.organizationId}|${record.canonicalUrl}|${record.title}|${record.summary}`
    )
    .digest("hex")
    .slice(0, 24);
}

async function loadCache(): Promise<ExtractionCache> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8")) as ExtractionCache;
  } catch {
    return {};
  }
}

async function saveCache(cache: ExtractionCache): Promise<void> {
  const entries = Object.entries(cache)
    .sort(
      (left, right) =>
        Date.parse(right[1].classifiedAt) - Date.parse(left[1].classifiedAt)
    )
    .slice(0, 1_000);
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(entries)), "utf8");
}

function inferEventType(text: string): OfficialLaunchEventType {
  if (/\b(open[- ]?weights|open[- ]?source|full weights)\b/i.test(text)) {
    return "open-source-release";
  }
  if (/\b(api|sdk|developer platform)\b/i.test(text)) return "api-release";
  if (
    /\b(model|gpt|claude|gemini|gemma|llama|grok|qwen|mistral|mixtral|deepseek|inkling|sonnet|opus|haiku)\b/i.test(
      text
    )
  ) {
    return "model-release";
  }
  if (/\b(update|upgrade|new (?:mode|feature|capability))\b/i.test(text)) {
    return "major-update";
  }
  return "product-launch";
}

function knownProduct(
  text: string,
  organization: OfficialLaunchOrganizationConfig
): string | undefined {
  return [...organization.knownProducts]
    .sort((left, right) => right.length - left.length)
    .find((product) => text.toLowerCase().includes(product.toLowerCase()));
}

function inferModel(text: string, product?: string): string | undefined {
  if (
    product &&
    (/[0-9-]/.test(product) || /^Daybreak$/i.test(product))
  ) {
    return product;
  }
  const explicit = text.match(
    /\b(?:GPT[-\s]?\d(?:\.\d+)?(?:[-\w]+)?|o[134](?:[-\w.]+)?|Claude\s+(?:Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)?)?|Gemini(?:\s+\d+(?:\.\d+)?)?(?:\s+(?:Flash|Pro|Ultra|Lite|Cyber|Omni))?|Gemma(?:\s+\d+(?:\.\d+)?)?|Llama(?:\s+\d+(?:\.\d+)?)?|Grok(?:\s+\d+(?:\.\d+)?)?|Qwen(?:\d+(?:\.\d+)?)?(?:-\w+)?|DeepSeek(?:[- ]?V\d(?:\.\d+)?)?(?:[- ]\w+)?|Mistral(?:\s+(?:Large|Small|Medium|Nemo))?(?:\s+\d+(?:\.\d+)?)?|Codestral|Devstral|Shieldstral|Pixtral|Lyria(?:\s+\d+(?:\.\d+)?)?|Muse(?:\s+Spark)?(?:\s+\d+(?:\.\d+)?)?|Inkling(?:-Small)?|Tinker)\b/i
  )?.[0];
  if (explicit) return explicit.replace(/\s+/g, " ").trim();
  return product && /\b(model|weights|reasoning|multimodal)\b/i.test(text)
    ? product
    : undefined;
}

function inferVersion(text: string, model?: string): string | undefined {
  return (
    text.match(/\bv?\d+\.\d+(?:\.\d+)?(?:[-_][a-z0-9.]+)?\b/i)?.[0] ||
    model?.match(/\b\d+(?:\.\d+)?(?:[-_][a-z0-9.]+)?\b/i)?.[0]
  )?.replace(/^v/i, "");
}

function extractCapabilities(text: string): string[] {
  const patterns: Array<[string, RegExp]> = [
    ["reasoning", /\breasoning\b/i],
    ["coding", /\bcod(?:e|ing)\b/i],
    ["audio", /\baudio|speech|voice\b/i],
    ["image", /\bimage|vision\b/i],
    ["video", /\bvideo\b/i],
    ["multimodal", /\bmultimodal\b/i],
    ["tool use", /\btool use|function calling\b/i],
    ["agents", /\bagent(?:ic|s)?\b/i],
    ["fine-tuning", /\bfine[- ]?tun/i],
    ["open weights", /\bopen[- ]?weights\b/i],
    ["long context", /\blong context|context window|1m tokens\b/i],
  ];
  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([capability]) => capability);
}

/** Conservative fallback when no LLM is configured. */
export function deterministicExtract(
  record: OfficialLaunchSourceRecord,
  organization: OfficialLaunchOrganizationConfig
): QualifiedLaunchRecord | null {
  const text = `${record.title} ${record.summary}`.replace(/\s+/g, " ").trim();
  if (EXCLUDE_CUE.test(text) || MINOR_CUE.test(text)) return null;
  if (!hasExplicitLaunchEvidence(text)) return null;

  const releaseCue = RELEASE_CUE.test(text);
  const productCue = PRODUCT_CUE.test(text);
  const availabilityCue = AVAILABILITY_CUE.test(text);
  const product = knownProduct(text, organization);
  const model = inferModel(text, product);
  if (
    !releaseCue ||
    (!productCue && !product && !model) ||
    (!product && !model && !availabilityCue)
  ) {
    return null;
  }

  const qualificationScore = Math.min(
    100,
    62 + 12 + (product || model ? 9 : 0) + (availabilityCue ? 8 : 0)
  );
  const noveltyScore = Math.min(
    100,
    48 +
      (model ? 15 : 0) +
      (/\b(new|first|introducing)\b/i.test(text) ? 10 : 0) +
      (/\bopen[- ]?weights\b/i.test(text) ? 8 : 0)
  );
  const impactScore = Math.min(
    100,
    54 +
      (model ? 14 : 0) +
      (availabilityCue ? 10 : 0) +
      (/\b(api|all plans|open[- ]?weights|generally available)\b/i.test(text)
        ? 8
        : 0)
  );

  return {
    ...record,
    eventType: inferEventType(text),
    entities: {
      company: organization.displayName,
      product,
      model,
      version: inferVersion(text, model),
    },
    capabilities: extractCapabilities(text),
    qualificationScore,
    noveltyScore,
    impactScore,
    confidence: product || model ? 0.9 : 0.76,
    qualificationMethod: "deterministic",
  };
}

function eventTypeFrom(value: unknown, fallback: string): OfficialLaunchEventType {
  const allowed: OfficialLaunchEventType[] = [
    "model-release",
    "product-launch",
    "api-release",
    "open-source-release",
    "major-update",
  ];
  return allowed.includes(value as OfficialLaunchEventType)
    ? (value as OfficialLaunchEventType)
    : inferEventType(fallback);
}

async function classifyWithOpenAI(
  record: OfficialLaunchSourceRecord,
  organization: OfficialLaunchOrganizationConfig
): Promise<Extraction> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Classify first-party AI content conservatively. Include only meaningful model, product, major feature, API, open-source, or developer-platform launches. Exclude hiring, events, partnerships alone, campaigns, opinion, and minor fixes. Research previews, opinion/research announcements, and generic concepts named like "X Models" do not qualify as model releases unless the text explicitly says the product/model is released, launched, available, accessible via API, downloadable, or can be tried. Return JSON: {"qualifies":boolean,"eventType":"model-release|product-launch|api-release|open-source-release|major-update","product":string|null,"model":string|null,"version":string|null,"capabilities":[string],"qualificationScore":0-100,"noveltyScore":0-100,"impactScore":0-100,"confidence":0-100}.',
        },
        {
          role: "user",
          content: `Company: ${organization.displayName}
Tier: ${organization.tier}
Known products: ${organization.knownProducts.join(", ")}
Channel: ${record.sourceType}
Title: ${record.title}
Summary: ${record.summary}
Published: ${record.publishedAt}
URL: ${record.url}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const parsed = JSON.parse(
    data.choices?.[0]?.message?.content || "{}"
  ) as Record<string, unknown>;
  return {
    qualifies: parsed.qualifies === true,
    eventType: eventTypeFrom(parsed.eventType, record.title),
    product: typeof parsed.product === "string" ? parsed.product || undefined : undefined,
    model: typeof parsed.model === "string" ? parsed.model || undefined : undefined,
    version: typeof parsed.version === "string" ? parsed.version || undefined : undefined,
    capabilities: Array.isArray(parsed.capabilities)
      ? parsed.capabilities.map(String).slice(0, 8)
      : [],
    qualificationScore: clamp(parsed.qualificationScore, 0),
    noveltyScore: clamp(parsed.noveltyScore, 0),
    impactScore: clamp(parsed.impactScore, 0),
    confidence: clamp(parsed.confidence, 0) / 100,
    classifiedAt: new Date().toISOString(),
  };
}

function toQualified(
  record: OfficialLaunchSourceRecord,
  organization: OfficialLaunchOrganizationConfig,
  extraction: Extraction,
  fallback: QualifiedLaunchRecord | null
): QualifiedLaunchRecord | null {
  if (
    !extraction.qualifies ||
    extraction.qualificationScore < organization.publishThresholds.qualification
  ) {
    return null;
  }
  const model = extraction.model || fallback?.entities.model;
  return {
    ...record,
    eventType: extraction.eventType,
    entities: {
      company: organization.displayName,
      product: extraction.product || fallback?.entities.product,
      model,
      version:
        (model ? inferVersion(model, model) : undefined) ||
        extraction.version ||
        fallback?.entities.version,
    },
    capabilities: extraction.capabilities.length
      ? extraction.capabilities
      : fallback?.capabilities || [],
    qualificationScore: extraction.qualificationScore,
    noveltyScore: extraction.noveltyScore,
    impactScore: extraction.impactScore,
    confidence: extraction.confidence,
    qualificationMethod: "openai",
  };
}

export async function qualifyLaunchRecords(
  records: OfficialLaunchSourceRecord[],
  organization: OfficialLaunchOrganizationConfig,
  options?: {
    diagnostics?: OfficialLaunchDiagnosticsCollector;
    forceRefresh?: boolean;
    mode?: "auto" | "deterministic";
  }
): Promise<QualifiedLaunchRecord[]> {
  const apiKey =
    options?.mode === "deterministic"
      ? undefined
      : process.env.OPENAI_API_KEY?.trim();
  const cache = apiKey ? await loadCache() : {};
  let changed = false;
  const results: QualifiedLaunchRecord[] = [];

  for (const record of records) {
    const text = `${record.title} ${record.summary}`;
    const diagnosticBase = {
      candidateId: record.id,
      organizationId: record.organizationId,
      channelId: record.channelId,
      title: record.title,
      url: record.url,
      stage: "qualification" as const,
    };
    if (EXCLUDE_CUE.test(text) || MINOR_CUE.test(text)) {
      options?.diagnostics?.record({
        ...diagnosticBase,
        status: "rejected",
        reason: "excluded-content-type",
        method: "deterministic",
      });
      continue;
    }
    if (!hasExplicitLaunchEvidence(text)) {
      options?.diagnostics?.record({
        ...diagnosticBase,
        status: "rejected",
        reason: "non-launch",
        method: "deterministic",
      });
      continue;
    }
    const deterministic = deterministicExtract(record, organization);
    if (!apiKey) {
      if (deterministic) {
        results.push(deterministic);
        options?.diagnostics?.record({
          ...diagnosticBase,
          status: "accepted",
          method: "deterministic",
        });
      } else {
        options?.diagnostics?.record({
          ...diagnosticBase,
          status: "rejected",
          reason: "non-launch",
          method: "deterministic",
        });
      }
      continue;
    }

    const key = cacheKey(record);
    let extraction = options?.forceRefresh ? undefined : cache[key];
    const method: "openai-api" | "cache" = extraction ? "cache" : "openai-api";
    if (!extraction) {
      try {
        extraction = await classifyWithOpenAI(record, organization);
        cache[key] = extraction;
        changed = true;
      } catch (error) {
        options?.diagnostics?.record({
          ...diagnosticBase,
          status: "failed",
          reason: "extraction-failure",
          method: "fallback",
          error: sanitizeDiagnosticError(error),
        });
        if (deterministic) {
          results.push(deterministic);
          options?.diagnostics?.record({
            ...diagnosticBase,
            status: "accepted",
            method: "fallback",
          });
        }
        continue;
      }
    }
    const qualified = toQualified(record, organization, extraction, deterministic);
    if (qualified) {
      results.push(qualified);
      options?.diagnostics?.record({
        ...diagnosticBase,
        status: "accepted",
        method,
      });
    } else {
      options?.diagnostics?.record({
        ...diagnosticBase,
        status: "rejected",
        reason:
          extraction.qualifies &&
          extraction.qualificationScore < organization.publishThresholds.qualification
            ? "below-tier-threshold"
            : "non-launch",
        method,
        scores: {
          qualification: extraction.qualificationScore,
          novelty: extraction.noveltyScore,
          impact: extraction.impactScore,
          confidence: extraction.confidence,
        },
        thresholds: {
          ...organization.publishThresholds,
          confidence: 0.7,
        },
      });
    }
  }

  if (changed) await saveCache(cache).catch(() => undefined);
  return results;
}
