"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";

const PULL_THRESHOLD = 72;
const WHEEL_THRESHOLD = 240;

export function PullToRefresh({
  onRefresh,
  refreshing,
  children,
  className,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  children: ReactNode;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const startY = useRef(0);
  const wheelAcc = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  const refreshingRef = useRef(refreshing);

  useEffect(() => {
    refreshingRef.current = refreshing;
    if (!refreshing) locked.current = false;
  }, [refreshing]);

  const setPullDistance = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  const reset = useCallback(() => {
    pullRef.current = 0;
    wheelAcc.current = 0;
    setPull(0);
  }, []);

  const trigger = useCallback(() => {
    if (locked.current || refreshingRef.current) return;
    locked.current = true;
    reset();
    onRefresh();
  }, [onRefresh, reset]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const atTop = () => el.scrollTop <= 1;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || locked.current) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      wheelAcc.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current || locked.current) return;
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY.current;

      if (atTop() && dy > 0) {
        e.preventDefault();
        setPullDistance(Math.min(dy * 0.45, PULL_THRESHOLD * 1.4));
      } else if (pullRef.current > 0) {
        reset();
      }
    };

    const onTouchEnd = () => {
      if (pullRef.current >= PULL_THRESHOLD) trigger();
      else reset();
    };

    const onWheel = (e: WheelEvent) => {
      if (refreshingRef.current || locked.current) return;
      if (!atTop() || e.deltaY >= 0) {
        if (pullRef.current > 0) {
          wheelAcc.current = 0;
          reset();
        }
        return;
      }

      wheelAcc.current += -e.deltaY;
      setPullDistance(
        Math.min(wheelAcc.current * 0.28, PULL_THRESHOLD * 1.4)
      );
      if (wheelAcc.current >= WHEEL_THRESHOLD) trigger();

      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        if (!locked.current && !refreshingRef.current) reset();
      }, 280);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, [reset, setPullDistance, trigger]);

  const show = refreshing || pull > 8;
  const ready = pull >= PULL_THRESHOLD;
  const indicatorOffset = refreshing ? 28 : Math.min(pull, PULL_THRESHOLD);

  return (
    <div className={className} style={{ position: "relative" }}>
      <RefreshHint
        visible={show}
        offset={indicatorOffset}
        spinning={refreshing}
        ready={ready}
      />
      <div
        ref={scrollerRef}
        className="h-full min-h-0 overflow-y-auto"
        style={{
          overscrollBehavior: "contain",
          transform:
            pull > 0 ? `translateY(${Math.min(pull * 0.25, 18)}px)` : undefined,
          transition:
            pull === 0
              ? "transform 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
              : undefined,
        }}
      >
        {children}
        <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-[var(--text-muted)]">
          <RefreshCw
            className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
            strokeWidth={1.75}
          />
          {refreshing ? "Refreshing…" : "Pull down from the top to refresh"}
        </div>
      </div>
    </div>
  );
}

function RefreshHint({
  visible,
  offset,
  spinning,
  ready,
}: {
  visible: boolean;
  offset: number;
  spinning: boolean;
  ready: boolean;
}) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
      style={{
        top: Math.max(8, offset - 8),
        background: "rgba(15,16,17,0.85)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
        backdropFilter: "blur(12px)",
        opacity: spinning ? 1 : Math.min(1, offset / 40),
        transition: spinning
          ? undefined
          : "opacity 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      <RefreshCw
        className={`h-3 w-3 ${spinning || ready ? "animate-spin" : ""}`}
        strokeWidth={1.75}
      />
      {spinning ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}
    </div>
  );
}
