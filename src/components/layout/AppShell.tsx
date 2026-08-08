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
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-[12px] leading-4 text-[var(--text-muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
