"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in with Google…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const supabase = createClient();
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const err =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (err) {
          if (!cancelled) {
            setMessage(err);
            setTimeout(() => router.replace("/feed?auth=expired"), 1600);
          }
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Fallback: session may already be in cookies / URL hash
          await supabase.auth.getSession();
        }

        if (!cancelled) {
          setMessage("Signed in. Taking you to Feed…");
          window.location.replace("/feed?auth=ok");
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setMessage("Sign-in almost worked, but redirect failed. Going back…");
          setTimeout(() => router.replace("/feed?auth=expired"), 1600);
        }
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
      <div
        className="w-full max-w-sm rounded-[12px] bg-[var(--bg-elevated)] p-6 text-center"
        style={{ boxShadow: "rgb(35,37,42) 0px 0px 0px 1px inset" }}
      >
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--text-primary)]" />
        <p className="text-[14px] font-medium text-[var(--text-primary)]">
          {message}
        </p>
        <p className="mt-2 text-[12px] leading-5 text-[var(--text-muted)]">
          If this page hangs, open{" "}
          <a
            className="underline"
            href="/feed"
          >
            Feed
          </a>{" "}
          directly — you may already be signed in. Turn off VPN fake-ip for
          railway.app / supabase.co if needed.
        </p>
      </div>
    </div>
  );
}
