import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "subtle" | "icon";

export function Button({
  children,
  variant = "ghost",
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  active?: boolean;
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-[6px] transition-colors duration-100",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" &&
          "bg-[var(--cta)] px-3 py-1.5 text-[13px] font-medium text-[var(--cta-text)] hover:bg-[#e8e9e9]",
        variant === "ghost" &&
          "px-2.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        variant === "subtle" &&
          "bg-[var(--bg-overlay)] px-2.5 py-1.5 text-[13px] text-[var(--text-body)] hover:bg-[var(--bg-active)]",
        variant === "icon" &&
          "h-8 w-8 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        active && "bg-[var(--bg-active)] text-[var(--text-primary)]",
        className
      )}
      style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
      {...props}
    >
      {children}
    </button>
  );
}
