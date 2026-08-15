"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import {
  fetchLibrary,
  toggleLibraryItem,
  type LibraryKind,
} from "@/lib/library-api";
import { prefsFromItems } from "@/lib/personalization";
import { createClient } from "@/lib/supabase/client";
import type { FeedItem } from "@/lib/types";

export function useLibraryCollection(
  kind: LibraryKind,
  copy: {
    added: string;
    removed: string;
    failed: string;
    signIn: string;
  }
) {
  const {
    user,
    ready: authReady,
    requireAuth,
    setPrefs,
    setCounts,
    configured,
  } = useAuth();
  const { toast } = useToast();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [ready, setReady] = useState(false);
  const inFlight = useRef(new Set<string>());
  const loadGen = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    if (!configured || !userId) {
      if (gen === loadGen.current) {
        setItems([]);
        setReady(true);
      }
      return;
    }
    try {
      const supabase = createClient();
      const next = await fetchLibrary(supabase, kind);
      if (gen !== loadGen.current) return;
      setItems(next);
      const other = await fetchLibrary(
        supabase,
        kind === "likes" ? "saves" : "likes"
      );
      if (gen !== loadGen.current) return;
      const liked = kind === "likes" ? next : other;
      const saved = kind === "saves" ? next : other;
      setPrefs(prefsFromItems(liked, saved));
      setCounts({ likes: liked.length, saves: saved.length });
    } catch (err) {
      console.error(err);
      if (gen === loadGen.current) setItems([]);
    } finally {
      if (gen === loadGen.current) setReady(true);
    }
  }, [configured, userId, kind, setPrefs, setCounts]);

  useEffect(() => {
    if (!authReady) return;
    void load();
  }, [authReady, load]);

  const toggle = useCallback(
    (item: FeedItem) => {
      if (!requireAuth(copy.signIn)) return;
      if (!userId || inFlight.current.has(item.id)) return;

      inFlight.current.add(item.id);
      loadGen.current += 1;
      setItems((prev) => {
        const exists = prev.some((row) => row.id === item.id);
        return exists
          ? prev.filter((row) => row.id !== item.id)
          : [item, ...prev];
      });

      const supabase = createClient();
      void toggleLibraryItem(supabase, kind, userId, item)
        .then(async ({ active, items: next }) => {
          setItems(next);
          toast(active ? copy.added : copy.removed, "success");
          const other = await fetchLibrary(
            supabase,
            kind === "likes" ? "saves" : "likes"
          );
          const liked = kind === "likes" ? next : other;
          const saved = kind === "saves" ? next : other;
          setPrefs(prefsFromItems(liked, saved));
          setCounts({ likes: liked.length, saves: saved.length });
        })
        .catch(async (err) => {
          console.error(err);
          toast(copy.failed, "error");
          await load();
        })
        .finally(() => {
          inFlight.current.delete(item.id);
        });
    },
    [
      requireAuth,
      userId,
      kind,
      copy.signIn,
      copy.added,
      copy.removed,
      copy.failed,
      toast,
      load,
      setPrefs,
      setCounts,
    ]
  );

  return {
    ready: ready && authReady,
    items,
    toggle,
  };
}
