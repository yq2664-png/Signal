import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { timeoutAfter } from "@/lib/timeout";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) return supabaseResponse;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh session if expired. Never block the page if Auth is slow.
  try {
    await Promise.race([
      supabase.auth.getUser(),
      timeoutAfter(3_000, "auth session refresh"),
    ]);
  } catch (error) {
    console.error("[auth/middleware]", error);
  }
  return supabaseResponse;
}
