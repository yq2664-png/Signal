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
  const { locale, setLocale, t } = useLanguage();
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
            <div role="group" aria-label={locale === "zh" ? "界面语言" : "Language"} className="flex rounded-md border border-[var(--border)] p-0.5 text-xs">
              {(["zh", "en"] as const).map((value) => (
                <button key={value} type="button" lang={value === "zh" ? "zh-CN" : "en"} aria-pressed={locale === value} onClick={() => setLocale(value)} className={`rounded px-2 py-1 ${locale === value ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                  {value === "zh" ? "中文" : "EN"}
                </button>
              ))}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
