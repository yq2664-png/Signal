import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAggregatedFeed } from "@/lib/live/aggregate";
import {
  assignRole,
  buildRankingReport,
  organizationOf,
  rankUnifiedFeed,
} from "@/lib/live/ranking";

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

describe.skipIf(!live)("Unified Feed Ranking V1.1 live refresh", () => {
  it("ranks one aggregated Feed and keeps FeedPage from reordering", async () => {
    const payload = await getAggregatedFeed();
    const ranked = rankUnifiedFeed(payload.items);
    const report = buildRankingReport(ranked);
    console.info("Unified ranking live window", report);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items.slice(0, 10).map((item) => item.id)).toEqual(
      ranked.items.slice(0, 10).map((item) => item.id)
    );
    const window = ranked.annotations.slice(0, 10);
    for (let index = 1; index < window.length; index += 1) {
      expect(window[index].organization).not.toBe(window[index - 1].organization);
    }
    const source = readFileSync(
      path.resolve(process.cwd(), "src/components/feed/FeedPage.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/sortFeedBoard/);
    expect(report.violations.filter((row) => row.startsWith("org-adjacency"))).toEqual(
      []
    );
    expect(assignRole(payload.items[0])).toBeTruthy();
    expect(organizationOf(payload.items[0])).toBeTruthy();
  }, 300_000);
});
