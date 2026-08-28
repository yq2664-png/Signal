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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sessionUserId = session?.user.id;
  if (!sessionUserId) {
    throw new Error("Sign-in expired. Sign in again, then retry.");
  }
  if (sessionUserId !== userId) {
    throw new Error("Sign-in expired. Sign in again, then retry.");
  }

  const { data: rows, error: lookupError } = await supabase
    .from(table(kind))
    .select("item_id")
    .eq("user_id", sessionUserId)
    .eq("item_id", item.id)
    .limit(1);

  if (lookupError) throw lookupError;

  const existing = rows?.[0];
  if (existing) {
    const { error } = await supabase
      .from(table(kind))
      .delete()
      .eq("user_id", sessionUserId)
      .eq("item_id", item.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(table(kind)).upsert({
      user_id: sessionUserId,
      item_id: item.id,
      item_json: JSON.parse(JSON.stringify(toLibraryRecord(item))),
    });
    if (error) throw error;
  }

  const items = await fetchLibrary(supabase, kind);
  return { active: !existing, items };
}

function toLibraryRecord(item: FeedItem): FeedItem {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    publishedAt: item.publishedAt,
    category: item.category,
    summary: item.summary,
    scores: item.scores,
    tier: item.tier,
    tags: item.tags,
    url: item.url,
    brief: item.brief,
    readingTimeMin: item.readingTimeMin,
    imageUrl: item.imageUrl,
    avatarUrl: item.avatarUrl,
    native: item.native,
    valueCue: item.valueCue,
    officialLaunch: item.officialLaunch,
    researchPaper: item.researchPaper,
  };
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
