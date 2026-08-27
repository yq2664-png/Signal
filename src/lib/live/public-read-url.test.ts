import { describe, expect, it } from "vitest";
import { publicReadUrl } from "@/lib/live/public-read-url";

describe("publicReadUrl", () => {
  it("maps changelog markdown to the HTML docs page and keeps the fragment", () => {
    expect(
      publicReadUrl(
        "https://docs.anthropic.com/en/release-notes/overview.md#august-19-2026"
      )
    ).toBe(
      "https://docs.anthropic.com/en/release-notes/overview#august-19-2026"
    );
    expect(
      publicReadUrl("https://platform.minimax.io/docs/release-notes/apis.md")
    ).toBe("https://platform.minimax.io/docs/release-notes/apis");
    expect(publicReadUrl("https://www.kimi.com/blog/kimi-k3")).toBe(
      "https://www.kimi.com/blog/kimi-k3"
    );
  });
});
