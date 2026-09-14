import { afterEach, expect, it, vi } from "vitest";
import { cleanProductDescription, fetchProductDescription, hasProductDescription } from "./product-content";
afterEach(() => vi.unstubAllGlobals());
it("removes navigation but keeps the actual description", () => {
  expect(cleanProductDescription("<p>Search your team's documents with AI.</p> Discussion | Link")).toBe("Search your team's documents with AI.");
  expect(hasProductDescription("Slashy Assistant", "Discussion | Link")).toBe(false);
  expect(hasProductDescription("Slashy Assistant", "Product Hunt is a place to discover the best new products")).toBe(false);
});
it("recovers an attributed description from the linked product page", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('<meta content="Search team documents using natural language." property="og:description">')));
  expect(await fetchProductDescription("https://www.producthunt.com/posts/slashy", "Slashy")).toBe("Search team documents using natural language.");
});
it("withholds inaccessible or generic pages and never fetches other hosts", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("blocked", { status: 403 })); vi.stubGlobal("fetch", fetchMock);
  expect(await fetchProductDescription("https://www.producthunt.com/posts/slashy", "Slashy")).toBeUndefined();
  expect(await fetchProductDescription("https://example.com/", "Slashy")).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
