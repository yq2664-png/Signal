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
const WHEEL_THRESHOLD = 140;

type Edge = "top" | "bottom" | null;

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
  const [edge, setEdge] = useState<Edge>(null);
  const pullRef = useRef(0);
  const edgeRef = useRef<Edge>(null);
  const startY = useRef(0);
  const wheelAcc = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  const refreshingRef = useRef(refreshing);

  useEffect(() => {
    refreshingRef.current = refreshing;
    if (!refreshing) locked.current = false;
  }, [refreshing]);

  const setPullState = useCallback((value: number, nextEdge: Edge) => {
    pullRef.current = value;
    edgeRef.current = nextEdge;
    setPull(value);
    setEdge(nextEdge);
  }, []);

  const reset = useCallback(() => {
    pullRef.current = 0;
    edgeRef.current = null;
    wheelAcc.current = 0;
    setPull(0);
    setEdge(null);
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
    const atBottom = () =>
      el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

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
        setPullState(Math.min(dy * 0.45, PULL_THRESHOLD * 1.4), "top");
      } else if (atBottom() && dy < 0) {
        e.preventDefault();
        setPullState(Math.min(-dy * 0.45, PULL_THRESHOLD * 1.4), "bottom");
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

      if (atTop() && e.deltaY < 0) {
        wheelAcc.current += -e.deltaY;
        setPullState(
          Math.min(wheelAcc.current * 0.35, PULL_THRESHOLD * 1.4),
          "top"
        );
        if (wheelAcc.current >= WHEEL_THRESHOLD) trigger();
      } else if (atBottom() && e.deltaY > 0) {
        wheelAcc.current += e.deltaY;
        setPullState(
          Math.min(wheelAcc.current * 0.35, PULL_THRESHOLD * 1.4),
          "bottom"
        );
        if (wheelAcc.current >= WHEEL_THRESHOLD) trigger();
      } else if (pullRef.current > 0) {
        wheelAcc.current = 0;
        reset();
      }

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
  }, [reset, setPullState, trigger]);

  const show = refreshing || pull > 8;
  const ready = pull >= PULL_THRESHOLD;
  const indicatorOffset = Math.min(pull, PULL_THRESHOLD);

  return (
    <div className={className} style={{ position: "relative" }}>
      <RefreshHint
        visible={show && (edge === "top" || refreshing)}
        position="top"
        offset={refreshing ? 28 : indicatorOffset}
        spinning={refreshing}
        ready={ready}
      />
      <RefreshHint
        visible={show && edge === "bottom" && !refreshing}
        position="bottom"
        offset={indicatorOffset}
        spinning={false}
        ready={ready}
      />
      <div
        ref={scrollerRef}
        className="h-full min-h-0 overflow-y-auto"
        style={{
          overscrollBehavior: "contain",
          transform:
            edge === "top" && pull > 0
              ? `translateY(${Math.min(pull * 0.25, 18)}px)`
              : edge === "bottom" && pull > 0
                ? `translateY(-${Math.min(pull * 0.25, 18)}px)`
                : undefined,
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
          {refreshing
            ? "Refreshing…"
            : "Pull down at top · keep scrolling at bottom to refresh"}
        </div>
      </div>
    </div>
  );
}

function RefreshHint({
  visible,
  position,
  offset,
  spinning,
  ready,
}: {
  visible: boolean;
  position: "top" | "bottom";
  offset: number;
  spinning: boolean;
  ready: boolean;
}) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
      style={{
        [position]: Math.max(8, offset - 8),
        background: "rgba(15,16,17,0.85)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
        backdropFilter: "blur(12px)",
        opacity: Math.min(1, offset / 40),
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
