import type { SupabaseClient } from "@supabase/supabase-js";
import { prefsFromItems, type UserPrefs } from "@/lib/personalization";
import type { FeedItem } from "@/lib/types";

export type LibraryKind = "likes" | "saves";

function table(kind: LibraryKind) {
  return kind;
}

export async function fetchLibrary(
  supabase: SupabaseClient,
  kind: LibraryKind
): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from(table(kind))
    .select("item_json")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => row.item_json as FeedItem)
    .filter((item): item is FeedItem => Boolean(item?.id));
}

export async function toggleLibraryItem(
  supabase: SupabaseClient,
  kind: LibraryKind,
  userId: string,
  item: FeedItem
): Promise<{ active: boolean; items: FeedItem[] }> {
  const { data: existing, error: lookupError } = await supabase
    .from(table(kind))
    .select("item_id")
    .eq("user_id", userId)
    .eq("item_id", item.id)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabase
      .from(table(kind))
      .delete()
      .eq("user_id", userId)
      .eq("item_id", item.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(table(kind)).upsert({
      user_id: userId,
      item_id: item.id,
      item_json: JSON.parse(JSON.stringify(item)) as FeedItem,
    });
    if (error) throw error;
  }

  const items = await fetchLibrary(supabase, kind);
  return { active: !existing, items };
}

export async function loadUserPrefs(
  supabase: SupabaseClient
): Promise<{ prefs: UserPrefs; counts: { likes: number; saves: number } }> {
  const [liked, saved] = await Promise.all([
    fetchLibrary(supabase, "likes"),
    fetchLibrary(supabase, "saves"),
  ]);
  return {
    prefs: prefsFromItems(liked, saved),
    counts: { likes: liked.length, saves: saved.length },
  };
}
