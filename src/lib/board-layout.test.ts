import { describe, expect, it } from "vitest";
import { columnCountFromWidth, splitIntoColumns } from "@/lib/board-layout";

describe("columnCountFromWidth", () => {
  it("matches the old Tailwind board breakpoints", () => {
    expect(columnCountFromWidth(375)).toBe(1);
    expect(columnCountFromWidth(639)).toBe(1);
    expect(columnCountFromWidth(640)).toBe(2);
    expect(columnCountFromWidth(1279)).toBe(2);
    expect(columnCountFromWidth(1280)).toBe(3);
    expect(columnCountFromWidth(1535)).toBe(3);
    expect(columnCountFromWidth(1536)).toBe(4);
  });
});

describe("splitIntoColumns", () => {
  it("puts consecutive ranked items across the first row", () => {
    expect(splitIntoColumns(["a", "b", "c", "d", "e"], 3)).toEqual([
      ["a", "d"],
      ["b", "e"],
      ["c"],
    ]);
  });

  it("keeps a single column in source order", () => {
    expect(splitIntoColumns(["a", "b", "c"], 1)).toEqual([["a", "b", "c"]]);
  });

  it("falls back to one column when the count is invalid", () => {
    expect(splitIntoColumns(["a", "b"], 0)).toEqual([["a", "b"]]);
    expect(splitIntoColumns(["a", "b"], Number.NaN)).toEqual([["a", "b"]]);
  });
});
