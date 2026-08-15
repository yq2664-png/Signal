import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWLISTED_REPOS,
  PUBLISH_CAP,
  fetchAllowlistedIssues,
  fetchDeveloperCommunityFeedItems,
  fetchHnEvidence,
} from "@/lib/live/developer-community";

function loadLocalGithubToken(): void {
  if (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_PAT?.trim()
  ) {
    return;
  }
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^(GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)=(.*)$/);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (value && !process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    // Live capture can still run unauthenticated with a tighter rate limit.
  }
}

loadLocalGithubToken();

const live = process.env.LIVE_SMOKE === "1";

describe.skipIf(!live)("Developer Community V1 live capture", () => {
  it("captures GitHub Issues from all 8 allowlisted repos only", async () => {
    const github = await fetchAllowlistedIssues(new Date());
    console.info("DC live GitHub", {
      captured: github.captured.length,
      rejected: github.rejected.length,
      errors: github.errors,
      perRepo: Object.fromEntries(
        ALLOWLISTED_REPOS.map((repo) => [
          repo,
          github.captured.filter((item) => item.repository === repo).length,
        ])
      ),
      rejectReasons: github.rejected.reduce<Record<string, number>>(
        (counts, row) => {
          counts[row.reason] = (counts[row.reason] ?? 0) + 1;
          return counts;
        },
        {}
      ),
    });
    expect(github.captured.every((item) => item.sourceType === "github-issue")).toBe(
      true
    );
    expect(
      github.captured.every((item) =>
        (ALLOWLISTED_REPOS as readonly string[]).includes(item.repository || "")
      )
    ).toBe(true);
    expect(
      github.captured.every((item) => !item.metadata || item.metadata.number !== undefined)
    ).toBe(true);
    for (const repo of ALLOWLISTED_REPOS) {
      expect(
        github.captured.filter((item) => item.repository === repo).length
      ).toBeLessThanOrEqual(40);
    }
  }, 180_000);

  it("captures HN as evidence only", async () => {
    const hn = await fetchHnEvidence(new Date());
    console.info("DC live HN", {
      captured: hn.captured.length,
      rejected: hn.rejected.length,
      errors: hn.errors,
      samples: hn.captured.slice(0, 8).map((item) => item.title),
    });
    expect(hn.captured.every((item) => item.sourceFamily === "hn")).toBe(true);
    expect(hn.captured.every((item) => item.sourceType === "hn-story")).toBe(
      true
    );
  }, 30_000);

  it("runs one full Developer Community pipeline refresh", async () => {
    const result = await fetchDeveloperCommunityFeedItems({ persist: true });
    console.info("DC live pipeline", result.report);
    expect(result.data.length).toBeLessThanOrEqual(PUBLISH_CAP);
    expect(result.report?.signals.publish).toBeLessThanOrEqual(PUBLISH_CAP);
    expect(result.data.length).toBe(result.report?.signals.publish);
    for (const item of result.data) {
      expect(item.source).toBe("Developer Community");
      expect(item.tags).toContain("developer-community");
      expect(item.tags).not.toContain("hackernews");
      expect(item.brief.whatHappened).toBeTruthy();
      expect(item.brief.whyItMatters).toBeTruthy();
      expect(item.brief.potentialImpact).toBeTruthy();
      expect(item.brief.keyTakeaway).toBeTruthy();
    }
    expect(
      result.signals?.filter((signal) => signal.status === "PUBLISH").length
    ).toBe(result.data.length);
  }, 180_000);
});
