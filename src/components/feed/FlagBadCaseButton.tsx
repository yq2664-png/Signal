"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { BadCaseReason, FeedItem } from "@/lib/types";

const REASONS: { id: BadCaseReason; label: string }[] = [
  { id: "title", label: "标题差" },
  { id: "summary", label: "摘要差" },
  { id: "ranking", label: "排序不当" },
  { id: "relevance", label: "不相关" },
  { id: "other", label: "其他" },
];

export function FlagBadCaseButton({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<BadCaseReason>("title");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  const submit = async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/bad-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, reason, note }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("saved");
      setOpen(false);
      setNote("");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="relative">
      <Button
        variant="subtle"
        aria-label="Flag bad case"
        onClick={() => setOpen((v) => !v)}
      >
        <Flag className="h-3.5 w-3.5" strokeWidth={1.75} />
        {status === "saved" ? "Logged" : "Bad case"}
      </Button>

      {open ? (
        <div
          className="absolute top-full left-0 z-40 mt-1 w-[240px] rounded-[8px] bg-[var(--bg-elevated)] p-2 shadow-[var(--shadow-card)]"
          style={{
            boxShadow: "var(--inset-border), rgba(0,0,0,0.45) 0 8px 24px",
          }}
        >
          <div className="label mb-1.5 px-1">Flag for strategy review</div>
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
            placeholder="可选：期望标题 / 问题说明"
            rows={2}
            className="mt-2 w-full resize-none rounded-[6px] bg-[var(--bg-overlay)] px-2 py-1.5 text-[12px] text-[var(--text-body)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={status === "saving"}
              onClick={submit}
            >
              {status === "saving" ? "Saving…" : "Submit"}
            </Button>
          </div>
          {status === "error" ? (
            <p className="mt-1 px-1 text-[11px] text-[var(--text-secondary)]">
              Save failed — try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
