"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";

const PULL_THRESHOLD = 96;
const PULL_DEADZONE = 40;
const TOUCH_RESISTANCE = 0.38;
const WHEEL_THRESHOLD = 720;
const WHEEL_RESISTANCE = 0.14;
const WHEEL_MIN_DELTA = 10;
const TOP_SETTLE_MS = 220;
const WHEEL_RELEASE_MS = 360;

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
  const pulling = useRef(false);
  const wheelAcc = useRef(0);
  const settledTop = useRef(false);
  const topTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    pulling.current = false;
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

    const markSettled = () => {
      if (topTimer.current) clearTimeout(topTimer.current);
      if (!atTop()) {
        settledTop.current = false;
        return;
      }
      topTimer.current = setTimeout(() => {
        settledTop.current = atTop();
      }, TOP_SETTLE_MS);
    };

    const onScroll = () => {
      if (!atTop()) {
        settledTop.current = false;
        if (topTimer.current) clearTimeout(topTimer.current);
        if (pullRef.current > 0) reset();
        return;
      }
      markSettled();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || locked.current) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      pulling.current = false;
      wheelAcc.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current || locked.current) return;
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY.current;

      if (atTop() && dy > PULL_DEADZONE) {
        pulling.current = true;
        e.preventDefault();
        const excess = dy - PULL_DEADZONE;
        setPullDistance(Math.min(excess * TOUCH_RESISTANCE, PULL_THRESHOLD * 1.35));
      } else if (pullRef.current > 0 && (dy <= PULL_DEADZONE || !atTop())) {
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
        settledTop.current = false;
        if (pullRef.current > 0) reset();
        return;
      }

      if (!settledTop.current || Math.abs(e.deltaY) < WHEEL_MIN_DELTA) return;

      wheelAcc.current += -e.deltaY;
      setPullDistance(
        Math.min(wheelAcc.current * WHEEL_RESISTANCE, PULL_THRESHOLD * 1.35)
      );

      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        if (locked.current || refreshingRef.current) return;
        if (wheelAcc.current >= WHEEL_THRESHOLD && pullRef.current >= PULL_THRESHOLD) {
          trigger();
        } else {
          reset();
        }
      }, WHEEL_RELEASE_MS);
    };

    markSettled();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      if (topTimer.current) clearTimeout(topTimer.current);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, [reset, setPullDistance, trigger]);

  const show = refreshing || pull > 10;
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
            pull > 0 ? `translateY(${Math.min(pull * 0.22, 16)}px)` : undefined,
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
        opacity: spinning ? 1 : Math.min(1, offset / 48),
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
