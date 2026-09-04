import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchXQualificationSample } from "@/lib/live/x";
import { shouldPublishXToFeed } from "@/lib/live/x-qualify";

function loadLocalEnv() {
  try {
    const text = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const match of text.matchAll(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/gm)) {
      const value = match[2]?.replace(/^['"]|['"]$/g, "").trim();
      if (value && !process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    /* optional */
  }
}

loadLocalEnv();

const live = process.env.LIVE_X === "1";

describe.skipIf(!live)("X admission live smoke", () => {
  it("classifies the latest ~100 candidates and publishes only concrete evidence", async () => {
    const sample = await fetchXQualificationSample();
    expect(sample.length).toBeGreaterThan(0);
    expect(sample.length).toBeLessThanOrEqual(100);

    const reject = sample.filter((row) => row.verdict.decision === "reject");
    const watch = sample.filter((row) => row.verdict.decision === "feed-only");
    const publish = sample.filter((row) => row.verdict.decision === "feed-brief");
    const reasons = sample.reduce<Record<string, number>>((acc, row) => {
      acc[row.verdict.reason] = (acc[row.verdict.reason] ?? 0) + 1;
      return acc;
    }, {});

    expect(publish.every((row) => shouldPublishXToFeed(row.verdict))).toBe(true);
    expect(watch.every((row) => !shouldPublishXToFeed(row.verdict))).toBe(true);
    expect(reject.every((row) => !shouldPublishXToFeed(row.verdict))).toBe(true);

    console.log(
      JSON.stringify(
        {
          total: sample.length,
          reject: reject.length,
          watch: watch.length,
          publish: publish.length,
          reasons,
          publishItems: publish.map((row) => ({
            text: row.text,
            author: row.authorHandle,
            reason: row.verdict.reason,
            likes: row.likes,
            isReply: row.isReply,
          })),
          rejectSample: reject.slice(0, 10).map((row) => ({
            text: row.text.slice(0, 160),
            reason: row.verdict.reason,
          })),
          watchSample: watch.slice(0, 10).map((row) => ({
            text: row.text.slice(0, 160),
            reason: row.verdict.reason,
          })),
        },
        null,
        2
      )
    );
  }, 30_000);
});
