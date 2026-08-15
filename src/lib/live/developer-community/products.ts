import {
  REPO_PRODUCT,
  isAllowlistedRepo,
} from "@/lib/live/developer-community/config";

const TITLE_PRODUCTS: Array<{ product: string; pattern: RegExp }> = [
  { product: "mcp", pattern: /\bmcp\b|model context protocol/i },
  { product: "claude-code", pattern: /\bclaude code\b|\bclaude\.md\b/i },
  { product: "cline", pattern: /\bcline\b/i },
  { product: "opencode", pattern: /\bopencode\b/i },
  { product: "vercel-ai", pattern: /\bai sdk\b|\bvercel\/ai\b|@ai-sdk\b/i },
  { product: "openai-api", pattern: /\bopenai\b.{0,24}\b(api|sdk|responses)\b/i },
];

export function productFromRepository(repository?: string): string {
  if (isAllowlistedRepo(repository)) return REPO_PRODUCT[repository];
  return "unknown";
}

export function productFromTitle(title: string, body = ""): string {
  const text = `${title}\n${body}`;
  return TITLE_PRODUCTS.find((item) => item.pattern.test(text))?.product ?? "unknown";
}

export function resolveProduct(input: {
  repository?: string;
  title: string;
  body?: string;
}): string {
  const fromRepo = productFromRepository(input.repository);
  if (fromRepo !== "unknown") return fromRepo;
  return productFromTitle(input.title, input.body);
}
