"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function AuthModal() {
  const {
    authOpen,
    closeAuth,
    authMessage,
    signInWithGoogle,
    configured,
  } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!authOpen) return null;

  const onGoogle = async () => {
    setBusy(true);
    setStatus(null);
    const result = await signInWithGoogle();
    if (!result.ok) {
      setStatus(result.message);
      setBusy(false);
      return;
    }
    setStatus(result.message);
    // Browser navigates away to Google; keep busy state
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={closeAuth}
    >
      <div
        className="w-full max-w-md rounded-[12px] bg-[var(--bg-elevated)] p-5"
        style={{ boxShadow: "rgb(35,37,42) 0px 0px 0px 1px inset" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              Sign in with Google
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">
              Sync likes, saves, and personalized ranking to your Google
              account. No email codes.
            </p>
          </div>
          <button
            type="button"
            onClick={closeAuth}
            className="rounded-[6px] p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {authMessage ? (
          <p className="mb-3 rounded-[6px] bg-[var(--bg-overlay)] px-3 py-2 text-[12px] text-[var(--text-body)]">
            {authMessage}
          </p>
        ) : null}

        {!configured ? (
          <p className="rounded-[6px] bg-[var(--bg-overlay)] px-3 py-2 text-[12px] leading-5 text-[var(--text-body)]">
            Add Supabase env vars on Railway, enable the Google provider, then
            redeploy.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGoogle()}
            className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--cta)] px-3 py-2.5 text-[13px] font-semibold text-[var(--cta-text)] disabled:opacity-60"
          >
            <GoogleMark />
            {busy ? "Redirecting…" : "Continue with Google"}
          </button>
        )}

        {status ? (
          <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.1 5.6l6.3 5.2C39.5 36.1 44 30.7 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
