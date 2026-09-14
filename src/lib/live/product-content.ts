import { stripHtml } from "./normalize";

/** Remove navigation chrome, never turn it into a product description. */
export function cleanProductDescription(raw: string): string {
  return stripHtml(raw)
    .replace(/(?:\bDiscussion\s*\|\s*Link|讨论\s*[|｜]\s*链接)\s*$/i, "")
    .replace(/\s+/g, " ").trim();
}
export function hasProductDescription(title: string, description: string): boolean {
  const clean = cleanProductDescription(description);
  if (!clean || clean.toLowerCase() === title.trim().toLowerCase()) return false;
  if (/^(?:discussion|link|comments?|read more|learn more|sign in|log in|讨论|链接)$/i.test(clean)) return false;
  if (/Product Hunt.*(?:best new products|discover|share|launch)|(?:discover|share).*best new products/i.test(clean)) return false;
  return clean.length >= 20 || /[\u4e00-\u9fff]{8}/u.test(clean);
}

/** Only use metadata from the linked Product Hunt product, not a guessed description. */
export async function fetchProductDescription(url: string, title: string): Promise<string | undefined> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !["www.producthunt.com", "producthunt.com"].includes(parsed.hostname)) return;
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8_000),
      headers: { Accept: "text/html" }, next: { revalidate: 3600 } });
    if (!response.ok) return;
    const html = await response.text();
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), match[3]]));
      if (!/^(?:og:description|description|twitter:description)$/i.test(attributes.property || attributes.name || "")) continue;
      const description = cleanProductDescription(attributes.content || "");
      if (hasProductDescription(title, description) && !/verify you are human|just a moment|access denied/i.test(description)) return description;
    }
  } catch { /* Missing or blocked source: withhold rather than invent content. */ }
}
