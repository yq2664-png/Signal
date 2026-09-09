import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { timeoutAfter } from "@/lib/timeout";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const err =
    searchParams.get("error_description") || searchParams.get("error");
  const next = searchParams.get("next") ?? "/feed";
  const base = "https://callback.invalid";
  let safeNext = new URL("/feed", base);
  try {
    const destination = new URL(next, base);
    if (next.startsWith("/") && destination.origin === base) safeNext = destination;
  } catch {
    // Malformed return paths fall back to the feed.
  }
  const { url, anonKey } = getSupabasePublicEnv();

  const redirect = (ok: boolean) => {
    safeNext.searchParams.set("auth", ok ? "ok" : "expired");
    // A relative Location keeps the browser's public origin. Behind Railway's
    // proxy, request.url can contain the internal 0.0.0.0 listener instead.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: `${safeNext.pathname}${safeNext.search}${safeNext.hash}` },
    });
  };

  if (!url || !anonKey || err || !code) {
    return redirect(false);
  }

  const pending: {
    name: string;
    value: string;
    options?: Parameters<NextResponse["cookies"]["set"]>[2];
  }[] = [];

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          pending.push({ name, value, options });
        });
      },
    },
  });

  let error: { message: string } | null = null;
  try {
    const exchanged = await Promise.race([
      supabase.auth.exchangeCodeForSession(code),
      timeoutAfter(8_000, "auth code exchange"),
    ]);
    error = exchanged.error;
  } catch (caught) {
    error = {
      message: caught instanceof Error ? caught.message : "auth code exchange failed",
    };
  }
  const response = redirect(!error);
  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  if (error) {
    console.error("[auth/callback] exchange failed", error.message);
  }
  return response;
}
