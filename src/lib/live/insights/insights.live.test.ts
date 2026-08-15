import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchDeveloperCommunityFeedItems } from "@/lib/live/developer-community";
import { fetchOfficialLaunchFeedItems } from "@/lib/live/official-launch";
import { fetchResearchPaperFeedItems } from "@/lib/live/research-paper";
import { buildInsightsFromLiveSources } from "@/lib/live/insights";

function loadLocalGithubToken(): void {
  if (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_PAT?.trim()
  ) {
    return;
  }
  try {
    const text = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^(GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)=(.*)$/);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (value && !process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    // Unauthenticated GitHub calls may still succeed at a lower rate limit.
  }
}

loadLocalGithubToken();

const live = process.env.LIVE_SMOKE === "1";

describe.skipIf(!live)("Insights V1 live refresh", () => {
  it("builds Insights from a 21-day qualified window without using Feed rank", async () => {
    const [officialLaunch, researchPaper, developerCommunity] = await Promise.all([
      fetchOfficialLaunchFeedItems(),
      fetchResearchPaperFeedItems(),
      fetchDeveloperCommunityFeedItems(),
    ]);
    const result = await buildInsightsFromLiveSources({
      feedItems: [...officialLaunch.data, ...researchPaper.data],
      communitySignals: developerCommunity.signals,
      persist: true,
    });
    console.info("Insights live report", {
      evidenceByRole: result.report.evidenceByRole,
      counts: result.report.counts,
      clusters: result.report.clusters,
      published: result.published.map((item) => ({
        headline: item.headline,
        type: item.type,
        confidence: item.confidence,
        freshness: item.freshness,
        contradiction: item.contradiction,
        roles: item.roles,
        organizations: item.organizations,
        evidence: item.evidence.map((row) => ({
          role: row.role,
          stance: row.stance,
          title: row.title,
        })),
      })),
      groundingViolations: result.report.groundingViolations,
    });
    expect(
      officialLaunch.data.length +
        researchPaper.data.length +
        (developerCommunity.signals?.length ?? 0)
    ).toBeGreaterThan(0);
    expect(result.published.length).toBeLessThanOrEqual(8);
    for (const insight of result.published) {
      expect(insight.status).toBe("PUBLISH");
      expect(insight.freshness).not.toBe("STALE");
      expect(insight.evidence.length).toBeGreaterThanOrEqual(2);
      expect(insight.actionVerb).toMatch(/^(reconsider|test|watch|validate)$/);
    }
    const ranking = readFileSync(
      path.resolve(process.cwd(), "src/lib/live/ranking/identity.ts"),
      "utf8"
    );
    const insightsIndex = readFileSync(
      path.resolve(process.cwd(), "src/lib/live/insights/index.ts"),
      "utf8"
    );
    expect(insightsIndex).not.toMatch("topicOf");
    expect(ranking).toMatch("export function topicOf");
  }, 300_000);
});
