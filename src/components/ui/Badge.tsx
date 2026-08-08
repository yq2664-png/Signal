import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-4",
        className
      )}
    >
      {children}
    </span>
  );
}

export function TierBadge({
  tier,
}: {
  tier: "High Impact" | "Trending" | "Emerging";
}) {
  const tone =
    tier === "High Impact"
      ? "tier-high"
      : tier === "Trending"
        ? "tier-trend"
        : "tier-emerging";

  return <Badge className={tone}>{tier}</Badge>;
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge className="bg-[rgba(255,255,255,0.05)] text-[var(--text-secondary)]">
      {category}
    </Badge>
  );
}
