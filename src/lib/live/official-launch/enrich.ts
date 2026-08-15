import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getCacheDir } from "@/lib/live/cache-dir";
import { stripHtml } from "@/lib/live/normalize";
import type {
  OfficialLaunchChannelConfig,
  OfficialLaunchOrganizationConfig,
} from "@/lib/live/official-launch/config";
import { canonicalizeUrl } from "@/lib/live/official-launch/dedupe";
import {
  sanitizeDiagnosticError,
  type OfficialLaunchDiagnosticsCollector,
} from "@/lib/live/official-launch/diagnostics";
import {
  AVAILABILITY_CUE,
  EXCLUDE_CUE,
  MINOR_CUE,
  RELEASE_CUE,
  deterministicExtract,
} from "@/lib/live/official-launch/extract";
import type { OfficialLaunchSourceRecord } from "@/lib/types";

export const ENRICHMENT_VERSION = "v2";
export const ENRICHMENT_FETCH_CAP = 8;
export const ENRICHMENT_TIMEOUT_MS = 9_000;
export const ENRICHMENT_MAX_CHARS = 800;
export const ENRICHMENT_MIN_VISIBLE_CHARS = 200;
export const ENRICHMENT_MIN_BYTES = 2_048;
export const ENRICHMENT_SHORT_RSS_CHARS = 200;
const ENRICHMENT_LEAD_PARAGRAPHS = 2;
const ENRICHMENT_MIN_PARAGRAPH_CHARS = 20;

const USER_AGENT = "SIGNAL-AI-Intelligence/0.1 (+official-launch)";
const CACHE_FILE = () =>
  path.join(getCacheDir(), "official-launch-enrichment-v2.json");

export type EnrichmentHttpResponse = {
  url: string;
  status: number;
  contentType: string;
  body: string;
};

export type EnrichmentFetchHtml = (
  url: string
) => Promise<EnrichmentHttpResponse>;

type EnrichmentCacheEntry = {
  version: string;
  canonicalUrl: string;
  contentHash: string;
  text: string;
  h1?: string;
  ogDescription?: string;
  fetchedAt: string;
  status: "ok" | "insufficient";
};

type EnrichmentCache = Record<string, EnrichmentCacheEntry>;

export interface EnrichLaunchOptions {
  diagnostics?: OfficialLaunchDiagnosticsCollector;
  fetchHtml?: EnrichmentFetchHtml;
  forceRefresh?: boolean;
}

type SkipReason =
  | "not-trusted-channel"
  | "not-sparse"
  | "already-qualified"
  | "excluded-content-type"
  | "no-entity-or-gate"
  | "not-first-party"
  | "cap"
  | "spa-or-insufficient-text"
  | "cached-insufficient";

function listingText(record: OfficialLaunchSourceRecord): string {
  return `${record.title} ${record.summary}`.replace(/\s+/g, " ").trim();
}

function knownProduct(
  text: string,
  organization: OfficialLaunchOrganizationConfig
): string | undefined {
  return [...organization.knownProducts]
    .sort((left, right) => right.length - left.length)
    .find((product) => text.toLowerCase().includes(product.toLowerCase()));
}

function digitBearingKnownProductInTitle(
  title: string,
  organization: OfficialLaunchOrganizationConfig
): boolean {
  return organization.knownProducts.some(
    (product) =>
      /[0-9]/.test(product) &&
      title.toLowerCase().includes(product.toLowerCase())
  );
}

function hasModelEntity(
  text: string,
  organization: OfficialLaunchOrganizationConfig
): boolean {
  const product = knownProduct(text, organization);
  if (product && /[0-9-]/.test(product)) return true;
  return Boolean(
    product && /\b(model|weights|reasoning|multimodal)\b/i.test(text)
  );
}

function failsProductAvailabilityGate(
  text: string,
  organization: OfficialLaunchOrganizationConfig
): boolean {
  if (!RELEASE_CUE.test(text)) return false;
  const product = knownProduct(text, organization);
  return !product && !hasModelEntity(text, organization) && !AVAILABILITY_CUE.test(text);
}

export function registrableHost(raw: string): string | undefined {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    if (parts.length < 2) return host || undefined;
    return parts.slice(-2).join(".");
  } catch {
    return undefined;
  }
}

export function isFirstPartyUrl(recordUrl: string, channelUrl: string): boolean {
  const recordHost = registrableHost(recordUrl);
  const channelHost = registrableHost(channelUrl);
  return Boolean(recordHost && channelHost && recordHost === channelHost);
}

function isTrustedChannel(channel?: OfficialLaunchChannelConfig): boolean {
  return Boolean(
    channel &&
      channel.enabled !== false &&
      channel.role !== "signal" &&
      channel.sourceType !== "official-x"
  );
}

function isSparseSurface(
  record: OfficialLaunchSourceRecord,
  channel: OfficialLaunchChannelConfig
): boolean {
  if (channel.adapter === "html-list") return true;
  if (channel.adapter === "rss") {
    return record.summary.trim().length < ENRICHMENT_SHORT_RSS_CHARS;
  }
  return false;
}

function channelFor(
  record: OfficialLaunchSourceRecord,
  organization: OfficialLaunchOrganizationConfig
): OfficialLaunchChannelConfig | undefined {
  return organization.channels.find(
    (channel) => channel.channelId === record.channelId
  );
}

export function shouldTriggerEnrichment(
  record: OfficialLaunchSourceRecord,
  organization: OfficialLaunchOrganizationConfig
): { eligible: boolean; skipReason?: SkipReason } {
  const channel = channelFor(record, organization);
  if (!isTrustedChannel(channel) || !channel) {
    return { eligible: false, skipReason: "not-trusted-channel" };
  }
  if (!isSparseSurface(record, channel)) {
    return { eligible: false, skipReason: "not-sparse" };
  }
  const text = listingText(record);
  if (EXCLUDE_CUE.test(text) || MINOR_CUE.test(text)) {
    return { eligible: false, skipReason: "excluded-content-type" };
  }
  if (deterministicExtract(record, organization)) {
    return { eligible: false, skipReason: "already-qualified" };
  }
  const entityOrGate =
    digitBearingKnownProductInTitle(record.title, organization) ||
    failsProductAvailabilityGate(text, organization);
  if (!entityOrGate) {
    return { eligible: false, skipReason: "no-entity-or-gate" };
  }
  if (!isFirstPartyUrl(record.url, channel.url)) {
    return { eligible: false, skipReason: "not-first-party" };
  }
  return { eligible: true };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, digits) => {
      const code = Number(digits);
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function innerTag(html: string, tag: string): string | undefined {
  const match = html.match(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i")
  );
  return match?.[1];
}

function metaContent(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
      "i"
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return undefined;
}

function stripChrome(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|aside|header)\b[\s\S]*?<\/\1>/gi, " ");
}

function visibleText(html: string): string {
  const withoutAttributes = stripChrome(html).replace(
    /\s(?:class|className|style|id)=(?:"[^"]*"|'[^']*')/gi,
    ""
  );
  return stripHtml(decodeEntities(withoutAttributes))
    .replace(/\s+/g, " ")
    .trim();
}

function stripAttrs(html: string): string {
  return html.replace(
    /\s(?:class|className|style|id)=(?:"[^"]*"|'[^']*')/gi,
    ""
  );
}

function scopedContent(html: string): string {
  const article = innerTag(html, "article");
  if (article) return stripAttrs(stripChrome(article));
  const main = innerTag(html, "main");
  if (main) return stripAttrs(stripChrome(main));
  const roleMain = html.match(
    /<([a-z0-9]+)[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/\1>/i
  )?.[2];
  if (roleMain) return stripAttrs(stripChrome(roleMain));
  return stripAttrs(stripChrome(html));
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentencesFrom(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= ENRICHMENT_MIN_PARAGRAPH_CHARS);
}

function paragraphsFrom(html: string): string[] {
  const tagged = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => normalizeText(stripHtml(decodeEntities(match[1]))))
    .filter((block) => block.length >= ENRICHMENT_MIN_PARAGRAPH_CHARS);
  if (tagged.length) return tagged.flatMap((block) => sentencesFrom(block));
  const visible = normalizeText(stripHtml(decodeEntities(html)));
  if (!visible) return [];
  const sentences = sentencesFrom(visible);
  return sentences.length
    ? sentences
    : visible.length >= ENRICHMENT_MIN_PARAGRAPH_CHARS
      ? [visible]
      : [];
}

function leadAndLaterParagraphs(html: string): { lead: string[]; later: string[] } {
  const scoped = scopedContent(html).replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, " ");
  const heading = scoped.search(/<h[1-6]\b[^>]*>/i);
  const leadHtml = heading === -1 ? scoped : scoped.slice(0, heading);
  const laterHtml = heading === -1 ? "" : scoped.slice(heading);
  return {
    lead: paragraphsFrom(leadHtml).slice(0, ENRICHMENT_LEAD_PARAGRAPHS),
    later: paragraphsFrom(laterHtml),
  };
}

function uniqueParts(parts: Array<string | undefined>): string {
  const seen: string[] = [];
  for (const part of parts) {
    const value = part?.replace(/\s+/g, " ").trim();
    if (!value) continue;
    if (seen.some((existing) => existing.includes(value) || value.includes(existing))) {
      const longer = seen.find(
        (existing) => existing.includes(value) || value.includes(existing)
      );
      if (longer && value.length > longer.length) {
        seen.splice(seen.indexOf(longer), 1, value);
      }
      continue;
    }
    seen.push(value);
  }
  return seen.join(" ").replace(/\s+/g, " ").trim();
}

function listingTitleIdentifiesPost(title: string, h1: string): boolean {
  const listing = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (listing.length < 6) return false;
  if (!h1.trim()) return true;
  const heading = h1.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return heading.includes(listing) || listing.includes(heading);
}

export type ParsedEnrichment = {
  h1: string;
  ogDescription: string;
  lead: string[];
  later: string[];
  visibleChars: number;
  text: string;
};

export function composeEnrichmentSummary(
  parsed: ParsedEnrichment,
  options?: { listingTitle?: string; seekAvailability?: boolean }
): string {
  const includeH1 =
    Boolean(parsed.h1) &&
    options?.listingTitle !== undefined &&
    !listingTitleIdentifiesPost(options.listingTitle, parsed.h1);
  const parts: string[] = [];
  if (includeH1) parts.push(parsed.h1);
  if (parsed.ogDescription) parts.push(parsed.ogDescription);
  for (const paragraph of parsed.lead) {
    const next = uniqueParts([...parts, paragraph]);
    if (parts.length && next.length > ENRICHMENT_MAX_CHARS) break;
    parts.push(paragraph);
  }
  if (options?.seekAvailability) {
    for (const paragraph of parsed.later) {
      if (MINOR_CUE.test(paragraph) || EXCLUDE_CUE.test(paragraph)) continue;
      if (!AVAILABILITY_CUE.test(paragraph)) continue;
      const next = uniqueParts([...parts, paragraph]);
      if (next.length > ENRICHMENT_MAX_CHARS) break;
      parts.push(paragraph);
    }
  }
  return uniqueParts(parts).slice(0, ENRICHMENT_MAX_CHARS);
}

export function parseEnrichmentHtml(html: string): ParsedEnrichment | null {
  if (!html.trim()) return null;
  const h1 = normalizeText(stripHtml(decodeEntities(innerTag(html, "h1") || "")));
  const ogDescription = metaContent(html, "og:description") || "";
  const { lead, later } = leadAndLaterParagraphs(html);
  const visibleChars = visibleText(scopedContent(html)).length;
  if (visibleChars < ENRICHMENT_MIN_VISIBLE_CHARS) return null;
  const parsed: ParsedEnrichment = {
    h1,
    ogDescription,
    lead,
    later,
    visibleChars,
    text: "",
  };
  parsed.text = composeEnrichmentSummary(parsed);
  if (!parsed.text) return null;
  return parsed;
}

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function isHtmlResponse(response: EnrichmentHttpResponse): boolean {
  const type = response.contentType.toLowerCase();
  return (
    !type ||
    type.includes("html") ||
    type.includes("xml") ||
    type.startsWith("text/")
  );
}

function cacheKey(canonicalUrl: string): string {
  return `${ENRICHMENT_VERSION}|${canonicalizeUrl(canonicalUrl)}`;
}

async function loadCache(): Promise<EnrichmentCache> {
  try {
    return JSON.parse(await readFile(CACHE_FILE(), "utf8")) as EnrichmentCache;
  } catch {
    return {};
  }
}

async function saveCache(cache: EnrichmentCache): Promise<void> {
  const entries = Object.entries(cache)
    .sort(
      (left, right) =>
        Date.parse(right[1].fetchedAt) - Date.parse(left[1].fetchedAt)
    )
    .slice(0, 2_000);
  await mkdir(getCacheDir(), { recursive: true });
  await writeFile(
    CACHE_FILE(),
    JSON.stringify(Object.fromEntries(entries)),
    "utf8"
  );
}

export async function defaultFetchEnrichmentHtml(
  url: string
): Promise<EnrichmentHttpResponse> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(ENRICHMENT_TIMEOUT_MS),
  });
  const body = await response.text();
  return {
    url: response.url || url,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    body,
  };
}

function applyEnrichment(
  record: OfficialLaunchSourceRecord,
  text: string
): OfficialLaunchSourceRecord {
  return {
    ...record,
    summary: text,
    originalContent: text,
  };
}

function qualifies(
  record: OfficialLaunchSourceRecord,
  organization: OfficialLaunchOrganizationConfig
): boolean {
  return Boolean(deterministicExtract(record, organization));
}

export async function enrichLaunchRecords(
  records: OfficialLaunchSourceRecord[],
  organizations: OfficialLaunchOrganizationConfig[],
  options?: EnrichLaunchOptions
): Promise<OfficialLaunchSourceRecord[]> {
  const fetchHtml = options?.fetchHtml ?? defaultFetchEnrichmentHtml;
  const cache = await loadCache();
  let changed = false;
  const enrichedById = new Map<string, OfficialLaunchSourceRecord>();

  for (const organization of organizations) {
    const orgRecords = records.filter(
      (record) => record.organizationId === organization.organizationId
    );
    const pending: OfficialLaunchSourceRecord[] = [];

    for (const record of orgRecords) {
      const trigger = shouldTriggerEnrichment(record, organization);
      const diagnosticBase = {
        candidateId: record.id,
        organizationId: record.organizationId,
        channelId: record.channelId,
        title: record.title,
        url: record.url,
        stage: "enrichment" as const,
        qualificationBeforeEnrichment: qualifies(record, organization),
      };

      if (!trigger.eligible) {
        options?.diagnostics?.record({
          ...diagnosticBase,
          status: "rejected",
          method: "deterministic",
          enrichmentTriggered: false,
          enrichmentSkipped: true,
          enrichmentCacheHit: false,
          enrichmentFetchSuccess: false,
          enrichmentFetchFailure: false,
          qualificationAfterEnrichment: diagnosticBase.qualificationBeforeEnrichment,
          error: trigger.skipReason,
        });
        continue;
      }

      const key = cacheKey(record.canonicalUrl || record.url);
      const cached = options?.forceRefresh ? undefined : cache[key];
      if (cached) {
        if (cached.status === "ok" && cached.text.trim()) {
          const next = applyEnrichment(record, cached.text);
          enrichedById.set(record.id, next);
          options?.diagnostics?.record({
            ...diagnosticBase,
            status: "accepted",
            method: "cache",
            enrichmentTriggered: true,
            enrichmentSkipped: false,
            enrichmentCacheHit: true,
            enrichmentFetchSuccess: false,
            enrichmentFetchFailure: false,
            enrichmentTextLength: cached.text.length,
            qualificationAfterEnrichment: qualifies(next, organization),
          });
        } else {
          options?.diagnostics?.record({
            ...diagnosticBase,
            status: "rejected",
            method: "cache",
            enrichmentTriggered: true,
            enrichmentSkipped: true,
            enrichmentCacheHit: true,
            enrichmentFetchSuccess: false,
            enrichmentFetchFailure: false,
            enrichmentTextLength: cached.text.length,
            qualificationAfterEnrichment: false,
            error: "cached-insufficient",
          });
        }
        continue;
      }

      pending.push(record);
    }

    const toFetch = pending.slice(0, ENRICHMENT_FETCH_CAP);
    for (const record of pending.slice(ENRICHMENT_FETCH_CAP)) {
      options?.diagnostics?.record({
        candidateId: record.id,
        organizationId: record.organizationId,
        channelId: record.channelId,
        title: record.title,
        url: record.url,
        stage: "enrichment",
        status: "rejected",
        method: "deterministic",
        enrichmentTriggered: true,
        enrichmentSkipped: true,
        enrichmentCacheHit: false,
        enrichmentFetchSuccess: false,
        enrichmentFetchFailure: false,
        qualificationBeforeEnrichment: false,
        qualificationAfterEnrichment: false,
        error: "cap",
      });
    }

    const fetched = await Promise.allSettled(
      toFetch.map(async (record) => {
        const response = await fetchHtml(record.url);
        return { record, response };
      })
    );

    fetched.forEach((result, index) => {
      const record = toFetch[index];
      const diagnosticBase = {
        candidateId: record.id,
        organizationId: record.organizationId,
        channelId: record.channelId,
        title: record.title,
        url: record.url,
        stage: "enrichment" as const,
        qualificationBeforeEnrichment: false,
      };

      if (result.status === "rejected") {
        options?.diagnostics?.record({
          ...diagnosticBase,
          status: "failed",
          reason: "fetch-failure",
          method: "deterministic",
          enrichmentTriggered: true,
          enrichmentSkipped: true,
          enrichmentCacheHit: false,
          enrichmentFetchSuccess: false,
          enrichmentFetchFailure: true,
          qualificationAfterEnrichment: false,
          error: sanitizeDiagnosticError(result.reason),
        });
        return;
      }

      const { response } = result.value;
      const bytes = Buffer.byteLength(response.body, "utf8");
      const parsed =
        response.status >= 200 &&
        response.status < 300 &&
        bytes >= ENRICHMENT_MIN_BYTES &&
        isHtmlResponse(response)
          ? parseEnrichmentHtml(response.body)
          : null;

      const key = cacheKey(record.canonicalUrl || record.url);
      if (!parsed) {
        cache[key] = {
          version: ENRICHMENT_VERSION,
          canonicalUrl: canonicalizeUrl(record.canonicalUrl || record.url),
          contentHash: contentHash(response.body.slice(0, 8_192)),
          text: "",
          fetchedAt: new Date().toISOString(),
          status: "insufficient",
        };
        changed = true;
        options?.diagnostics?.record({
          ...diagnosticBase,
          status: "failed",
          reason: "fetch-failure",
          method: "deterministic",
          enrichmentTriggered: true,
          enrichmentSkipped: true,
          enrichmentCacheHit: false,
          enrichmentFetchSuccess: false,
          enrichmentFetchFailure: true,
          enrichmentTextLength: 0,
          qualificationAfterEnrichment: false,
          error: "spa-or-insufficient-text",
        });
        return;
      }

      const summary = composeEnrichmentSummary(parsed, {
        listingTitle: record.title,
        seekAvailability: failsProductAvailabilityGate(
          listingText(record),
          organization
        ),
      });
      if (!summary) {
        cache[key] = {
          version: ENRICHMENT_VERSION,
          canonicalUrl: canonicalizeUrl(record.canonicalUrl || record.url),
          contentHash: contentHash(response.body.slice(0, 8_192)),
          text: "",
          fetchedAt: new Date().toISOString(),
          status: "insufficient",
        };
        changed = true;
        options?.diagnostics?.record({
          ...diagnosticBase,
          status: "failed",
          reason: "fetch-failure",
          method: "deterministic",
          enrichmentTriggered: true,
          enrichmentSkipped: true,
          enrichmentCacheHit: false,
          enrichmentFetchSuccess: false,
          enrichmentFetchFailure: true,
          enrichmentTextLength: 0,
          qualificationAfterEnrichment: false,
          error: "spa-or-insufficient-text",
        });
        return;
      }

      cache[key] = {
        version: ENRICHMENT_VERSION,
        canonicalUrl: canonicalizeUrl(record.canonicalUrl || record.url),
        contentHash: contentHash(summary),
        text: summary,
        h1: parsed.h1,
        ogDescription: parsed.ogDescription,
        fetchedAt: new Date().toISOString(),
        status: "ok",
      };
      changed = true;
      const next = applyEnrichment(record, summary);
      enrichedById.set(record.id, next);
      options?.diagnostics?.record({
        ...diagnosticBase,
        status: "accepted",
        method: "deterministic",
        enrichmentTriggered: true,
        enrichmentSkipped: false,
        enrichmentCacheHit: false,
        enrichmentFetchSuccess: true,
        enrichmentFetchFailure: false,
        enrichmentTextLength: summary.length,
        qualificationAfterEnrichment: qualifies(next, organization),
      });
    });
  }

  if (changed) await saveCache(cache).catch(() => undefined);

  return records.map((record) => enrichedById.get(record.id) ?? record);
}
