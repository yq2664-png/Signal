import type { SupabaseClient } from "@supabase/supabase-js";

export async function sendEmailSignIn(client: SupabaseClient, email: string, origin: string) {
  const address = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  try {
    const { error } = await client.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message: "Check your inbox for a sign-in link. Open it in this browser to finish signing in.",
    };
  } catch {
    return { ok: false, message: "Could not send the sign-in link. Check your connection and try again." };
  }
}
