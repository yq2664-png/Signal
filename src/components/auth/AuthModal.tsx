"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function AuthModal() {
  const { authOpen, closeAuth, authMessage, requestLink, configured } =
    useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!authOpen) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const result = await requestLink(email);
    setBusy(false);
    setStatus(result.message);
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
              Sign in with email
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">
              Supabase magic link — after login, likes and saves sync and
              personalize your feed.
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
            Add <span className="mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to{" "}
            <span className="mono">.env.local</span>, run{" "}
            <span className="mono">supabase/schema.sql</span>, then restart.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="block">
              <span className="label mb-1.5 block">Email</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-[6px] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none"
                style={{ boxShadow: "rgb(35,37,42) 0px 0px 0px 1px inset" }}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-[6px] bg-[var(--cta)] px-3 py-2 text-[13px] font-semibold text-[var(--cta-text)] disabled:opacity-60"
            >
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
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
