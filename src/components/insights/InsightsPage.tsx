"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useFeed } from "@/context/FeedContext";
import type { Insight, InsightRole } from "@/lib/types";
import { evidenceRoleLabel } from "@/lib/surface/insight-link";
import { formatRelative } from "@/lib/utils";

function InsightRow({
  insight,
  selected,
  featured,
  onSelect,
}: {
  insight: Insight;
  selected: boolean;
  featured?: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`w-full cursor-pointer border-b border-[var(--border)] px-4 py-3 text-left transition-colors duration-100 ${
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      }`}
      style={{
        borderBottom: "1px solid var(--border)",
        transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      {featured ? (
        <div className="label mb-1.5">Strongest today</div>
      ) : null}
      <h2
        className={
          featured
            ? "text-[16px] font-semibold leading-5 tracking-[-0.02em] text-[var(--text-primary)]"
            : "text-[14px] font-medium leading-5 tracking-[-0.015em] text-[var(--text-primary)]"
        }
      >
        {insight.headline}
      </h2>
      {featured ? (
        <p className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-[var(--text-secondary)]">
          {insight.thesis}
        </p>
      ) : null}
    </article>
  );
}

function EvidenceGroup({
  role,
  insight,
}: {
  role: InsightRole;
  insight: Insight;
}) {
  const rows = insight.evidence.filter((item) => item.role === role);
  if (rows.length === 0) return null;
  return (
    <section className="mb-5">
      <div className="label mb-2">{evidenceRoleLabel(role)}</div>
      <ul className="space-y-2">
        {rows.map((item) => (
          <li key={item.objectId} className="text-[13px] leading-5">
            <div className="text-[var(--text-primary)]">{item.title}</div>
            <div className="text-[12px] text-[var(--text-muted)]">
              {item.organization}
              {" · "}
              {formatRelative(item.timestamp)}
              {item.url ? (
                <>
                  {" · "}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-[var(--border)] underline-offset-2"
                  >
                    Read original
                  </a>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsightPanel({ insight }: { insight: Insight }) {
  const confidence =
    insight.confidence === "HIGH"
      ? "High confidence"
      : insight.confidence === "MEDIUM"
        ? "Medium confidence"
        : "Low confidence";

  return (
    <div className="fade-in flex h-full flex-col overflow-hidden">
      <div
        className="shrink-0 border-b border-[var(--border)] px-5 py-5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h2 className="text-[22px] font-semibold leading-7 tracking-[-0.02em] text-[var(--text-primary)]">
          {insight.headline}
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-[var(--text-body)]">
          {insight.thesis}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <section className="mb-6">
          <div className="label mb-2">Why it matters</div>
          <p className="text-[14px] leading-6 text-[var(--text-body)]">
            {insight.whyItMatters}
          </p>
        </section>
        {insight.contradiction ? (
          <section className="mb-6 rounded-[6px] bg-[var(--bg-overlay)] px-3 py-2">
            <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
              What launched and what people are hitting do not match. That gap
              is the pattern.
            </p>
          </section>
        ) : null}
        <EvidenceGroup role="SUPPLY" insight={insight} />
        <EvidenceGroup role="CAPABILITY" insight={insight} />
        <EvidenceGroup role="ADOPTION" insight={insight} />
        <section className="mb-5">
          <div className="label mb-2">What this means</div>
          <p className="text-[13px] leading-5 text-[var(--text-body)]">
            <span className="font-medium capitalize text-[var(--text-primary)]">
              {insight.actionVerb}.
            </span>{" "}
            {insight.productImplication}
          </p>
        </section>
        <p className="text-[11px] text-[var(--text-muted)]">
          {confidence} · updated {formatRelative(insight.lastUpdatedAt)}
        </p>
      </div>
    </div>
  );
}

export function InsightsPage() {
  const { insights, loading } = useFeed();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const visible = useMemo(
    () => insights.filter((item) => item.freshness !== "STALE"),
    [insights]
  );
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (requestedId && visible.some((item) => item.insightId === requestedId)) {
      setSelectedId(requestedId);
      return;
    }
    setSelectedId((current) => current || visible[0]?.insightId || "");
  }, [requestedId, visible]);

  const selected =
    visible.find((item) => item.insightId === selectedId) ?? visible[0] ?? null;

  return (
    <AppShell
      title="Insights"
      subtitle="What larger change is emerging"
    >
      <div className="flex h-full min-h-0">
        <section
          className="flex w-full min-w-0 flex-col border-r border-[var(--border)] md:w-[40%]"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-8 text-[13px] text-[var(--text-muted)]">
                {loading ? "Loading…" : "No Insights in this window."}
              </p>
            ) : (
              visible.map((insight, index) => (
                <InsightRow
                  key={insight.insightId}
                  insight={insight}
                  featured={index === 0}
                  selected={selected?.insightId === insight.insightId}
                  onSelect={() => setSelectedId(insight.insightId)}
                />
              ))
            )}
          </div>
        </section>
        <section className="hidden min-h-0 flex-1 bg-[var(--bg-elevated)] md:block">
          {selected ? (
            <InsightPanel insight={selected} />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-[13px] text-[var(--text-muted)]">
                {loading ? "Loading…" : "No Insights in this window."}
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
