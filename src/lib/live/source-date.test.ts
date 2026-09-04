import { describe, expect, it } from "vitest";
import { isVerifiedPublishedAt, parseSourceDate } from "@/lib/live/source-date";

describe("parseSourceDate", () => {
  it("keeps a source-native ISO date", () => {
    expect(parseSourceDate("2026-07-16T12:00:00.000Z")).toBe(
      "2026-07-16T12:00:00.000Z"
    );
  });

  it("accepts unix seconds from HN", () => {
    const seconds = Math.floor(Date.UTC(2026, 0, 27, 12) / 1000);
    expect(parseSourceDate(seconds)).toBe("2026-01-27T12:00:00.000Z");
  });

  it("returns undefined instead of inventing crawl time", () => {
    expect(parseSourceDate(undefined)).toBeUndefined();
    expect(parseSourceDate("")).toBeUndefined();
    expect(parseSourceDate("not-a-date")).toBeUndefined();
    expect(parseSourceDate(0)).toBeUndefined();
  });

  it("does not treat an empty stamp as verified", () => {
    expect(isVerifiedPublishedAt("")).toBe(false);
    expect(isVerifiedPublishedAt("2026-01-27T12:00:00.000Z")).toBe(true);
  });

  it("does not treat Invalid Date as verified", () => {
    expect(isVerifiedPublishedAt("Invalid Date")).toBe(false);
  });
});
