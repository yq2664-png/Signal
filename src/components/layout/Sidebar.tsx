"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  Heart,
  LayoutList,
  LogOut,
  Sparkles,
  Radio,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBookmarks } from "@/context/BookmarksContext";
import { useLikes } from "@/context/LikesContext";

const nav = [
  { href: "/feed", label: "Feed", icon: LayoutList },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/liked", label: "Liked", icon: Heart, badge: "likes" as const },
  { href: "/saved", label: "Saved", icon: Bookmark, badge: "saves" as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const { count: likeCount } = useLikes();
  const { count: saveCount } = useBookmarks();
  const { user, openAuth, logout, prefs } = useAuth();

  return (
    <aside
      className="flex h-full w-[var(--sidebar-w)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg)]"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      <div className="flex h-[var(--topbar-h)] items-center gap-2.5 px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-[var(--cta)]">
          <Radio className="h-3.5 w-3.5 text-[var(--cta-text)]" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            SIGNAL
          </div>
          <div className="mono text-[10px] leading-3 text-[var(--text-muted)]">
            AI Intelligence
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-3">
        <div className="label mb-2 px-2">Workspace</div>
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          const count =
            badge === "likes" ? likeCount : badge === "saves" ? saveCount : 0;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] transition-colors duration-100",
                active
                  ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              )}
              style={{
                transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              }}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 font-medium">{label}</span>
              {count > 0 ? (
                <span className="mono text-[10px] text-[var(--text-muted)]">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        {user ? (
          <div className="rounded-[6px] bg-[var(--bg-overlay)] p-3">
            <div className="label mb-1">Signed in</div>
            <p className="truncate text-[12px] text-[var(--text-body)]">
              {user.email}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {prefs && prefs.sampleSize > 0
                ? `Personalized from ${prefs.sampleSize} signals`
                : "Like / save to personalize ranking"}
            </p>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        ) : (
          <div className="rounded-[6px] bg-[var(--bg-overlay)] p-3">
            <div className="label mb-1">Account</div>
            <p className="body-sm mb-2">
              Supabase email login syncs likes, saves, and personalized ranking.
            </p>
            <button
              type="button"
              onClick={() => openAuth()}
              className="w-full rounded-[6px] bg-[var(--cta)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--cta-text)]"
            >
              Sign in with email
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
