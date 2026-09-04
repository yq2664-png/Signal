import { describe, expect, it } from "vitest";
import { githubRepoPublishedAt } from "@/lib/live/github";

describe("githubRepoPublishedAt", () => {
  it("uses created_at instead of the last git push", () => {
    expect(
      githubRepoPublishedAt({
        created_at: "2023-04-12T10:00:00.000Z",
        updated_at: "2026-08-28T16:00:00.000Z",
        pushed_at: "2026-08-28T16:12:00.000Z",
      })
    ).toBe("2023-04-12T10:00:00.000Z");
  });

  it("does not use push or update time when created_at is missing", () => {
    expect(
      githubRepoPublishedAt({
        updated_at: "2025-01-02T00:00:00.000Z",
        pushed_at: "2026-08-28T00:00:00.000Z",
      })
    ).toBeUndefined();
  });
});
