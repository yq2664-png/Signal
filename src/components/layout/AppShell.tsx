"use client";
import { useLanguage } from "@/context/LanguageContext";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { locale, setLocale, t, translationState } = useLanguage();
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-[var(--topbar-h)] shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] px-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              {t(title)}
            </h1>
            {subtitle ? (
              <p className="truncate text-[12px] leading-4 text-[var(--text-muted)]">
                {t(subtitle)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <div className="flex items-center gap-2">
              {translationState !== "ready" ? (
                <span role="status" className="hidden text-[10px] text-[var(--text-secondary)] sm:inline">
                  {translationState === "retrying" ? (locale === "zh" ? "译文重试中" : "Retrying translation") : (locale === "zh" ? "译文准备中" : "Translating")}
                </span>
              ) : null}
              <div role="group" aria-label={locale === "zh" ? "语言，当前为中文" : "Language, English selected"} className="language-glass">
                <span aria-hidden="true" className="language-glass-selection" style={{ transform: `translateX(${locale === "en" ? "100%" : "0"})` }} />
                {(["zh", "en"] as const).map((value) => (
                  <button key={value} type="button" lang={value === "zh" ? "zh-CN" : "en"} aria-pressed={locale === value} onClick={() => setLocale(value)} className="language-glass-option">
                    <span aria-hidden="true" className="language-glass-check">{locale === value ? "✓" : ""}</span>
                    {value === "zh" ? "中文" : "EN"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
