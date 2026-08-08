export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  const { url, anonKey } = getSupabasePublicEnv();
  return Boolean(url && anonKey);
}
