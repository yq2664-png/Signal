import { createHash } from "crypto";
import Parser from "rss-parser";
import type { OfficialLaunchSourceRecord } from "@/lib/types";
import type {
  OfficialLaunchChannelConfig,
  OfficialLaunchOrganizationConfig,
} from "@/lib/live/official-launch/config";
import { canonicalizeUrl, identityUrl } from "@/lib/live/official-launch/dedupe";
import { stripHtml } from "@/lib/live/normalize";

type Adapter = (
  organization: OfficialLaunchOrganizationConfig,
  channel: OfficialLaunchChannelConfig
) => Promise<OfficialLaunchSourceRecord[]>;

type ParsedRssItem = {
  title?: string;
  link?: string;
  guid?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
  creator?: string;
};

const USER_AGENT = "SIGNAL-AI-Intelligence/0.1 (+official-launch)";
const parser = new Parser({ timeout: 12_000 });

function absoluteUrl(raw: string, base: string): string | undefined {
  try {
    return new URL(raw, base).toString();
  } catch {
    return undefined;
  }
}

function safeIsoDate(raw?: string): string {
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function calendarDayUtc(raw: string): string | undefined {
  const value = raw.trim().replace(/[*_`]/g, "");
  const iso = value.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, year, month, day] = iso;
    const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), 12);
    const date = new Date(timestamp);
    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) {
      return date.toISOString();
    }
  }

  const named = value.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),\s+(20\d{2})\b/i
  );
  if (!named) return undefined;
  const month = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ].findIndex((candidate) => candidate.startsWith(named[1].toLowerCase().replace(".", "")));
  const timestamp = Date.UTC(Number(named[3]), month, Number(named[2]), 12);
  const date = new Date(timestamp);
  return date.getUTCDate() === Number(named[2]) ? date.toISOString() : undefined;
}

function record(
  organization: OfficialLaunchOrganizationConfig,
  channel: OfficialLaunchChannelConfig,
  input: {
    sourceId?: string;
    title: string;
    summary?: string;
    url: string;
    publishedAt?: string;
    author?: string;
  }
): OfficialLaunchSourceRecord {
  const canonicalUrl = canonicalizeUrl(input.url);
  return {
    id: `${channel.channelId}:${input.sourceId || canonicalUrl}`,
    organizationId: organization.organizationId,
    channelId: channel.channelId,
    sourceType: channel.sourceType,
    authority: channel.authority,
    role: channel.role,
    title: stripHtml(input.title),
    summary: stripHtml(input.summary || input.title).slice(0, 1_000),
    originalContent: input.summary || input.title,
    url: input.url,
    canonicalUrl,
    publishedAt: safeIsoDate(input.publishedAt),
    author: input.author,
  };
}

export async function parseRssChannel(
  xml: string,
  organization: OfficialLaunchOrganizationConfig,
  channel: OfficialLaunchChannelConfig
): Promise<OfficialLaunchSourceRecord[]> {
  const feed = await parser.parseString(xml);
  return ((feed.items as ParsedRssItem[] | undefined) ?? [])
    .flatMap((item) => {
      const url = item.link || item.guid;
      if (!item.title || !url) return [];
      return [
        record(organization, channel, {
          sourceId: item.guid,
          title: item.title,
          summary: item.contentSnippet || item.content,
          url,
          publishedAt: item.isoDate || item.pubDate,
          author: item.creator,
        }),
      ];
    })
    .slice(0, channel.limit ?? 10);
}

export const fetchRssChannel: Adapter = async (organization, channel) => {
  const response = await fetch(channel.url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return parseRssChannel(await response.text(), organization, channel);
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      if (code === 0x200b || code === 0x200c || code === 0x200d) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, digits) => {
      const code = Number(digits);
      if (code === 8203 || code === 8204 || code === 8205) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function dateMatches(html: string): Array<{ raw: string; index: number }> {
  const found: Array<{ raw: string; index: number }> = [];
  for (const match of html.matchAll(/datetime=["']([^"']+)["']/gi)) {
    found.push({ raw: match[1], index: match.index ?? 0 });
  }
  for (const match of html.matchAll(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},\s+20\d{2}\b/gi
  )) {
    found.push({ raw: match[0], index: match.index ?? 0 });
  }
  for (const match of html.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)) {
    found.push({ raw: match[0], index: match.index ?? 0 });
  }
  return found;
}

function dateInHtml(html: string): string | undefined {
  const first = dateMatches(html)[0];
  return first ? calendarDayUtc(first.raw) || safeIsoDate(first.raw) : undefined;
}

function dateNear(html: string, index: number): string | undefined {
  const start = Math.max(0, index - 800);
  const context = html.slice(start, index + 400);
  const target = index - start;
  const dates = dateMatches(context);
  if (!dates.length) return undefined;
  const closest = dates.reduce((best, item) =>
    Math.abs(item.index - target) < Math.abs(best.index - target) ? item : best
  );
  return calendarDayUtc(closest.raw) || safeIsoDate(closest.raw);
}

function isChromeTitle(title: string): boolean {
  return (
    title.length < 6 ||
    /^(?:featured|read more|learn more|view (?:more|all)|this documentation|next|previous|blog|home)$/i.test(
      title
    )
  );
}

const CATEGORY_HEADING =
  /^(?:research|open source|computer vision|blog posts?|news|featured|latest news|product|engineering|science)$/i;

function isListingIndex(url: string, channelUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const channel = new URL(channelUrl);
    return (
      parsed.pathname.replace(/\/$/, "") === channel.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

function nearbyListingFallback(
  html: string,
  index: number
): { title?: string; summary?: string } {
  const context = html.slice(Math.max(0, index - 1_800), index);
  const headings = [...context.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map((match) =>
      stripHtml(decodeHtml(match[1])).replace(/\s+/g, " ").trim()
    )
    .filter(
      (title) => !isChromeTitle(title) && !CATEGORY_HEADING.test(title)
    );
  const summaries = [...context.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) =>
      stripHtml(decodeHtml(match[1])).replace(/\s+/g, " ").trim()
    )
    .filter((text) => text.length >= 40);
  return {
    title: headings.at(-1),
    summary: summaries.at(-1),
  };
}

function listingText(fragment: string): {
  title: string;
  summary?: string;
} {
  const decoded = decodeHtml(fragment);
  const heading =
    decoded.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ||
    decoded.match(
      /<(?:div|span)\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/i
    )?.[1];
  const title = stripHtml(heading || decoded).replace(/\s+/g, " ").trim();
  const summary = decoded.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  return {
    title,
    summary: summary ? stripHtml(summary).replace(/\s+/g, " ").trim() : undefined,
  };
}

function titleFromAnchor(attrs: string, inner: string): {
  title: string;
  summary?: string;
} {
  const content = listingText(inner);
  if (!isChromeTitle(content.title)) return content;
  const aria = stripHtml(
    decodeHtml(attrs.match(/aria-label=["']([^"']+)["']/i)?.[1] || "")
  )
    .replace(/^read\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!isChromeTitle(aria)) {
    return { title: aria, summary: content.summary };
  }
  return content;
}

export function parseHtmlListChannel(
  html: string,
  organization: OfficialLaunchOrganizationConfig,
  channel: OfficialLaunchChannelConfig
): OfficialLaunchSourceRecord[] {
  const anchors = html.matchAll(
    /<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi
  );
  const seen = new Set<string>();
  const results: OfficialLaunchSourceRecord[] = [];

  for (const match of anchors) {
    const href = decodeHtml(match[2]);
    const url = absoluteUrl(href, channel.url);
    if (!url || (channel.linkPattern && !new URL(url).pathname.includes(channel.linkPattern))) {
      continue;
    }
    const canonicalUrl = canonicalizeUrl(url);
    if (
      isListingIndex(url, channel.url) ||
      seen.has(canonicalUrl)
    ) {
      continue;
    }

    let content = titleFromAnchor(match[1], match[3]);
    if (isChromeTitle(content.title)) {
      const nearby = nearbyListingFallback(html, match.index ?? 0);
      if (nearby.title) {
        content = {
          title: nearby.title,
          summary: content.summary || nearby.summary,
        };
      }
    }
    const title = content.title;
    if (isChromeTitle(title)) continue;
    seen.add(canonicalUrl);
    results.push(
      record(organization, channel, {
        title,
        summary: content.summary,
        url,
        publishedAt:
          dateInHtml(match[3]) || dateNear(html, match.index ?? 0),
      })
    );
    if (results.length >= (channel.limit ?? 10)) break;
  }

  return results;
}

export const fetchHtmlListChannel: Adapter = async (organization, channel) => {
  const response = await fetch(channel.url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return parseHtmlListChannel(await response.text(), organization, channel);
};

export function parseHtmlReleaseNotes(
  html: string,
  organization: OfficialLaunchOrganizationConfig,
  channel: OfficialLaunchChannelConfig
): OfficialLaunchSourceRecord[] {
  const content = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html;
  const dateHeadings = [
    ...content.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi),
  ].flatMap((match) => {
    const publishedAt = calendarDayUtc(stripHtml(match[1]));
    return publishedAt ? [{ match, publishedAt }] : [];
  });
  const results: OfficialLaunchSourceRecord[] = [];

  for (const [dateIndex, dateHeading] of dateHeadings.entries()) {
    const sectionStart =
      (dateHeading.match.index ?? 0) + dateHeading.match[0].length;
    const sectionEnd =
      dateHeadings[dateIndex + 1]?.match.index ?? content.length;
    const section = content.slice(sectionStart, sectionEnd);
    const entries = [...section.matchAll(/<h3\b([^>]*)>([\s\S]*?)<\/h3>/gi)];

    for (const [entryIndex, entry] of entries.entries()) {
      const title = stripHtml(decodeHtml(entry[2]))
        .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
        .trim();
      if (title.length < 6 || /^[a-z][a-z0-9._-]*$/.test(title)) continue;
      const bodyStart = (entry.index ?? 0) + entry[0].length;
      const bodyEnd = entries[entryIndex + 1]?.index ?? section.length;
      const body = section.slice(bodyStart, bodyEnd);
      const headingId = entry[1].match(/\bid=["']([^"']+)["']/i)?.[1];
      const url = headingId
        ? `${channel.url}#${headingId}`
        : `${channel.url}#${title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}`;
      results.push(
        record(organization, channel, {
          sourceId: stableMarkdownIdentity(
            dateHeading.publishedAt,
            title,
            identityUrl(url)
          ),
          title,
          summary: stripHtml(body).replace(/\s+/g, " ").trim(),
          url,
          publishedAt: dateHeading.publishedAt,
        })
      );
      if (results.length >= (channel.limit ?? 10)) return results;
    }
  }

  return results;
}

export const fetchHtmlReleaseNotesChannel: Adapter = async (
  organization,
  channel
) => {
  const response = await fetch(channel.url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseHtmlReleaseNotes(
    await response.text(),
    organization,
    channel
  );
};

function cleanMarkdown(value: string): string {
  return stripHtml(
    value
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[*_~#>]+/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function markdownLinks(value: string, base: string): string[] {
  return [...value.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)]
    .map((match) => absoluteUrl(decodeHtml(match[1]), base))
    .filter((url): url is string => Boolean(url));
}

function stableMarkdownIdentity(date: string, title: string, url: string): string {
  return createHash("sha256")
    .update(`${date}|${title.toLowerCase()}|${canonicalizeUrl(url)}`)
    .digest("hex")
    .slice(0, 20);
}

type MarkdownDateSection = {
  dateLabel: string;
  publishedAt: string;
  body: string;
};

function markdownDateSections(markdown: string): MarkdownDateSection[] {
  const heading = /^(#{2,4})\s+(.+?)\s*$/gm;
  let monthContext: { month: number; year: number } | undefined;
  const allHeadings = [...markdown.matchAll(heading)];
  const matches = allHeadings.flatMap((match) => {
    const label = match[2].trim();
    const monthYear = label.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(20\d{2})$/i
    );
    if (monthYear) {
      monthContext = {
        month: [
          "january", "february", "march", "april", "may", "june",
          "july", "august", "september", "october", "november", "december",
        ].indexOf(monthYear[1].toLowerCase()),
        year: Number(monthYear[2]),
      };
      return [];
    }
    const direct = calendarDayUtc(label);
    if (direct) return [{ match, publishedAt: direct }];
    const shortDay = label.match(
      /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})$/i
    );
    if (!shortDay || !monthContext) return [];
    return [{
      match,
      publishedAt: new Date(
        Date.UTC(monthContext.year, monthContext.month, Number(shortDay[1]), 12)
      ).toISOString(),
    }];
  });
  return matches.map(({ match, publishedAt }, index) => ({
    dateLabel: match[2].trim(),
    publishedAt,
    body: markdown.slice(
      (match.index ?? 0) + match[0].length,
      allHeadings.find(
        (candidate) =>
          (candidate.index ?? 0) > (match.index ?? 0) &&
          candidate[1].length <= match[1].length
      )?.index ??
        matches[index + 1]?.match.index ??
        markdown.length
    ).trim(),
  }));
}

function sectionEntries(section: MarkdownDateSection, mode: "date-sections" | "date-bullets"): string[] {
  if (mode === "date-bullets") {
    const bullets = [...section.body.matchAll(/^(?:[*+-])\s+(.+(?:\n(?!\s*(?:[*+-]|#{1,6})\s).+)*)/gm)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    return bullets.length ? bullets : [section.body];
  }

  const subheadings = [...section.body.matchAll(/^#{3,6}\s+(.+?)\s*$/gm)];
  if (!subheadings.length) return [section.body];
  return subheadings.map((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = subheadings[index + 1]?.index ?? section.body.length;
    return `${heading[1]}\n${section.body.slice(start, end)}`.trim();
  });
}

function entryTitle(entry: string): string {
  const heading = entry.match(/^#{1,6}\s+(.+)$/m)?.[1];
  const descriptiveLine = entry
    .split(/\n+/)
    .map(cleanMarkdown)
    .find(
      (line) =>
        line.length >= 6 &&
        !/^(?:Feature|Update|Fix)(?:\s*·|\s*$)/i.test(line)
    );
  const firstSentence = (descriptiveLine || cleanMarkdown(entry))
    .split(/(?<=[.!?])\s+/)[0];
  return cleanMarkdown(heading || firstSentence).slice(0, 240);
}

export function parseMarkdownReleaseNotes(
  markdown: string,
  organization: OfficialLaunchOrganizationConfig,
  channel: OfficialLaunchChannelConfig
): OfficialLaunchSourceRecord[] {
  const mode = channel.markdownMode ?? "date-sections";
  const results: OfficialLaunchSourceRecord[] = [];

  for (const section of markdownDateSections(markdown)) {
    for (const entry of sectionEntries(section, mode)) {
      const title = entryTitle(entry);
      if (title.length < 6) continue;
      const summary = cleanMarkdown(entry).slice(0, 1_000);
      const url =
        markdownLinks(entry, channel.url)[0] ||
        `${channel.url}#${section.dateLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      results.push(
        record(organization, channel, {
          sourceId: stableMarkdownIdentity(section.publishedAt, title, url),
          title,
          summary,
          url,
          publishedAt: section.publishedAt,
        })
      );
      if (results.length >= (channel.limit ?? 10)) return results;
    }
  }
  return results;
}

export const fetchMarkdownReleaseNotesChannel: Adapter = async (
  organization,
  channel
) => {
  const response = await fetch(channel.url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/markdown, text/plain" },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseMarkdownReleaseNotes(await response.text(), organization, channel);
};

const ADAPTERS: Record<OfficialLaunchChannelConfig["adapter"], Adapter> = {
  rss: fetchRssChannel,
  "html-list": fetchHtmlListChannel,
  "html-release-notes": fetchHtmlReleaseNotesChannel,
  "markdown-release-notes": fetchMarkdownReleaseNotesChannel,
};

export async function fetchOfficialChannel(
  organization: OfficialLaunchOrganizationConfig,
  channel: OfficialLaunchChannelConfig
): Promise<OfficialLaunchSourceRecord[]> {
  return ADAPTERS[channel.adapter](organization, channel);
}
