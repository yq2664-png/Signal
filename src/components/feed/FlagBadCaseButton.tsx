"use client";

import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { BadCaseReason, FeedItem } from "@/lib/types";

const REASONS: { id: BadCaseReason; label: string }[] = [
  { id: "title", label: "Unclear title" },
  { id: "summary", label: "Unclear summary" },
  { id: "ranking", label: "Wrong place in Feed" },
  { id: "relevance", label: "Not relevant" },
  { id: "other", label: "Other" },
];

const STORAGE_KEY = "signal-bad-case-flags";

type FlagMap = Record<string, { reason: BadCaseReason; at: string }>;

function loadFlags(): FlagMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FlagMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveFlag(itemId: string, reason: BadCaseReason) {
  const next = { ...loadFlags(), [itemId]: { reason, at: new Date().toISOString() } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function FlagBadCaseButton({
  item,
  quiet = false,
}: {
  item: FeedItem;
  quiet?: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<BadCaseReason>("title");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [flaggedReason, setFlaggedReason] = useState<BadCaseReason | null>(null);

  useEffect(() => {
    const hit = loadFlags()[item.id];
    if (hit) {
      setFlagged(true);
      setFlaggedReason(hit.reason);
      setReason(hit.reason);
    } else {
      setFlagged(false);
      setFlaggedReason(null);
    }
  }, [item.id]);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/bad-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, reason, note }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      saveFlag(item.id, reason);
      setFlagged(true);
      setFlaggedReason(reason);
      setOpen(false);
      setNote("");
      const label = REASONS.find((r) => r.id === reason)?.label ?? reason;
      toast(`Flagged · ${label}`, "success");
    } catch {
      toast("Couldn’t save the flag. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      {quiet ? (
        <button
          type="button"
          aria-label={flagged ? "Already flagged" : "Flag this item"}
          aria-pressed={flagged}
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          {flagged ? "Flagged" : "Flag"}
        </button>
      ) : (
        <Button
          variant="subtle"
          aria-label={flagged ? "Bad case already flagged" : "Flag bad case"}
          aria-pressed={flagged}
          onClick={() => setOpen((v) => !v)}
          className={flagged ? "text-[var(--status-label)]" : undefined}
        >
          <Flag
            className="h-3.5 w-3.5"
            strokeWidth={1.75}
            fill={flagged ? "currentColor" : "none"}
          />
          {flagged ? "Flagged" : "Bad case"}
        </Button>
      )}

      {open ? (
        <div
          className="absolute top-full left-0 z-40 mt-1 w-[240px] rounded-[8px] bg-[var(--bg-elevated)] p-2 shadow-[var(--shadow-card)]"
          style={{
            boxShadow: "var(--inset-border), rgba(0,0,0,0.45) 0 8px 24px",
          }}
        >
          <div className="label mb-1.5 px-1">
            {flagged ? "Update flag" : "What’s wrong?"}
          </div>
          {flagged && flaggedReason ? (
            <p className="mb-1.5 px-1 text-[11px] text-[var(--text-muted)]">
              Already flagged ·{" "}
              {REASONS.find((r) => r.id === flaggedReason)?.label ?? flaggedReason}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.id)}
                className={
                  reason === r.id
                    ? "rounded-[4px] bg-[var(--bg-active)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
                    : "rounded-[4px] bg-[var(--bg-overlay)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            rows={2}
            className="mt-2 w-full resize-none rounded-[6px] bg-[var(--bg-overlay)] px-2 py-1.5 text-[12px] text-[var(--text-body)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={submit}>
              {saving ? "Saving…" : flagged ? "Update" : "Submit"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
