"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function AuthModal() {
  const {
    authOpen,
    closeAuth,
    authMessage,
    requestLink,
    verifyOtpCode,
    configured,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!authOpen) return null;

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const result = await requestLink(email);
    setBusy(false);
    setStatus(result.message);
    if (result.ok) setSent(true);
  };

  const confirmCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const result = await verifyOtpCode(email, code);
    setBusy(false);
    setStatus(result.message);
    if (result.ok) {
      setCode("");
      setSent(false);
      closeAuth();
    }
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
              We email a one-time code. Enter it here to sign in — no broken
              confirm links needed.
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
            Add Supabase env vars on Railway, then redeploy.
          </p>
        ) : !sent ? (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
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
              {busy ? "Sending…" : "Send login code"}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmCode} className="flex flex-col gap-3">
            <p className="text-[12px] text-[var(--text-secondary)]">
              Code sent to <span className="text-[var(--text-primary)]">{email}</span>
            </p>
            <label className="block">
              <span className="label mb-1.5 block">One-time code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-[6px] bg-[var(--bg)] px-3 py-2 text-[14px] tracking-[0.2em] text-[var(--text-primary)] outline-none"
                style={{ boxShadow: "rgb(35,37,42) 0px 0px 0px 1px inset" }}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-[6px] bg-[var(--cta)] px-3 py-2 text-[13px] font-semibold text-[var(--cta-text)] disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify & sign in"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode("");
                setStatus(null);
              }}
              className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Use a different email
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
