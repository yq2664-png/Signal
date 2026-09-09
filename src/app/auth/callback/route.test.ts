import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { exchange } = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({
  getSupabasePublicEnv: () => ({ url: "https://example.supabase.co", anonKey: "test" }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (cookies: { name: string; value: string }[]) => void };
  }) => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        const result = await exchange(code);
        if (!result.error) options.cookies.setAll([{ name: "session", value: "test-session" }]);
        return result;
      },
    },
  }),
}));

import { GET } from "./route";

describe("OAuth callback behind a proxy", () => {
  beforeEach(() => exchange.mockReset());

  it("returns to the browser origin and preserves session cookies", async () => {
    exchange.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest("http://0.0.0.0:3000/auth/callback?code=valid"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/feed?auth=ok");
    expect(response.cookies.get("session")?.value).toBe("test-session");
    expect(exchange).toHaveBeenCalledWith("valid");
  });

  it("keeps failed sign-ins on the public site too", async () => {
    exchange.mockResolvedValue({ error: { message: "expired code" } });
    const response = await GET(new NextRequest("http://0.0.0.0:3000/auth/callback?code=expired"));
    expect(response.headers.get("location")).toBe("/feed?auth=expired");
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "http://[", "relative"])(
    "rejects unsafe return path %s", async (next) => {
      const response = await GET(new NextRequest(`http://0.0.0.0:3000/auth/callback?next=${encodeURIComponent(next)}`));
      expect(response.headers.get("location")).toBe("/feed?auth=expired");
    },
  );

  it("adds the outcome before fragments and preserves other query parameters", async () => {
    const next = encodeURIComponent("/feed?view=saved&auth=ok#items");
    const response = await GET(new NextRequest(`http://localhost:3000/auth/callback?next=${next}`));
    expect(response.headers.get("location")).toBe("/feed?view=saved&auth=expired#items");
  });
});
