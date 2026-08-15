export const DEVELOPER_COMMUNITY_USER_AGENT =
  "SIGNAL-AI-Intelligence/0.1 (+developer-community-v1)";

export const PUBLISH_CAP = 4;

export const DEFAULT_ISSUE_WINDOW_DAYS = 30;

export const HIGH_VOLUME_ISSUE_WINDOW_DAYS = 7;

export const EVIDENCE_CAP_PER_REPO = 40;

export const CLUSTER_WINDOW_DAYS = 14;

export const RECURRENCE_DAYS = 7;

export const HN_EVIDENCE_WINDOW_DAYS = 14;

export const ALLOWLISTED_REPOS = [
  "modelcontextprotocol/servers",
  "modelcontextprotocol/python-sdk",
  "modelcontextprotocol/typescript-sdk",
  "anthropics/claude-code",
  "openai/openai-python",
  "cline/cline",
  "anomalyco/opencode",
  "vercel/ai",
] as const;

export type AllowlistedRepo = (typeof ALLOWLISTED_REPOS)[number];

export const HIGH_VOLUME_REPOS: AllowlistedRepo[] = [
  "anthropics/claude-code",
  "anomalyco/opencode",
];

export const REPO_PRODUCT: Record<AllowlistedRepo, string> = {
  "modelcontextprotocol/servers": "mcp",
  "modelcontextprotocol/python-sdk": "mcp",
  "modelcontextprotocol/typescript-sdk": "mcp",
  "anthropics/claude-code": "claude-code",
  "openai/openai-python": "openai-api",
  "cline/cline": "cline",
  "anomalyco/opencode": "opencode",
  "vercel/ai": "vercel-ai",
};

export function isAllowlistedRepo(repo?: string): repo is AllowlistedRepo {
  return Boolean(repo && (ALLOWLISTED_REPOS as readonly string[]).includes(repo));
}

export function issueWindowDays(repo: string): number {
  return (HIGH_VOLUME_REPOS as readonly string[]).includes(repo)
    ? HIGH_VOLUME_ISSUE_WINDOW_DAYS
    : DEFAULT_ISSUE_WINDOW_DAYS;
}

export function issueWindowStart(repo: string, now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() - issueWindowDays(repo));
  return start;
}

export function isWithinIssueWindow(
  repo: string,
  createdAt: string | undefined,
  now: Date
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return created >= issueWindowStart(repo, now).getTime() && created <= now.getTime();
}
