import { describe, expect, it } from "vitest";
import { rssCategoryLabel } from "@/lib/live/rss";

describe("rssCategoryLabel", () => {
  it("keeps strings and ignores objects that cannot be stringified", () => {
    expect(rssCategoryLabel(" AI ")).toBe("AI");
    expect(
      rssCategoryLabel({
        toString: () => ({}),
        valueOf: () => ({}),
      })
    ).toBe("");
    expect(rssCategoryLabel({ _: "changelog" })).toBe("changelog");
  });
});
