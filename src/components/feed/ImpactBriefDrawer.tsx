"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GripHorizontal, X } from "lucide-react";
import { ImpactBriefPanel } from "@/components/feed/FeedItem";
import { Button } from "@/components/ui/Button";
import type { FeedItem } from "@/lib/types";

const MIN_W = 300;
const MAX_W = 720;
const DEFAULT_W = 440;
const STORAGE_KEY = "signal-impact-brief-layout-v3";
const EDGE_EPS = 2;

type Layout = { left: number | null; width: number };

function clampWidth(w: number, containerW: number): number {
  const max = Math.max(MIN_W, containerW);
  return Math.max(MIN_W, Math.min(Math.min(MAX_W, max), Math.round(w)));
}

function clampLeft(left: number, width: number, containerW: number): number {
  const maxLeft = Math.max(0, containerW - width);
  return Math.max(0, Math.min(maxLeft, Math.round(left)));
}

function flushRightLeft(width: number, containerW: number): number {
  return Math.max(0, containerW - width);
}

function isFlushRight(left: number, width: number, containerW: number): boolean {
  return left + width >= containerW - EDGE_EPS;
}

function loadLayout(containerW: number): Layout {
  if (typeof window === "undefined") {
    return { left: null, width: DEFAULT_W };
  }
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("signal-impact-brief-layout-v2");
    if (!raw) return { left: null, width: DEFAULT_W };
    const parsed = JSON.parse(raw) as Partial<Layout> & { side?: string };
    const width = clampWidth(Number(parsed.width) || DEFAULT_W, containerW);
    if (typeof parsed.left === "number") {
      return { left: clampLeft(parsed.left, width, containerW), width };
    }
    if (parsed.side === "left") return { left: 0, width };
    return { left: null, width };
  } catch {
    return { left: null, width: DEFAULT_W };
  }
}

export function ImpactBriefDrawer({
  item,
  onClose,
}: {
  item: FeedItem;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [containerW, setContainerW] = useState(DEFAULT_W + 48);
  const [width, setWidth] = useState(DEFAULT_W);
  const [left, setLeft] = useState(0);
  const [moving, setMoving] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [ready, setReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const moveRef = useRef<{
    pointerId: number;
    startX: number;
    originLeft: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    edge: "left" | "right";
    startX: number;
    originLeft: number;
    originWidth: number;
    containerW: number;
    pinRight: boolean;
  } | null>(null);
  const layoutRef = useRef({ left: 0, width: DEFAULT_W, containerW: DEFAULT_W + 48 });
  layoutRef.current = { left, width, containerW };

  const applyContainerWidth = useCallback((cw: number) => {
    if (cw <= 0) return;
    setContainerW(cw);
    setWidth((w) => {
      const nextW = clampWidth(w, cw);
      setLeft((l) => clampLeft(l, nextW, cw));
      return nextW;
    });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const init = () => {
      const cw = root.clientWidth || window.innerWidth;
      const layout = loadLayout(cw);
      const w = clampWidth(layout.width, cw);
      setContainerW(cw);
      setWidth(w);
      setLeft(
        layout.left == null
          ? flushRightLeft(w, cw)
          : clampLeft(layout.left, w, cw)
      );
      setReady(true);
    };
    init();

    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? root.clientWidth;
      applyContainerWidth(cw);
    });
    ro.observe(root);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onMq = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onMq);

    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onMq);
    };
  }, [applyContainerWidth]);

  useEffect(() => {
    if (!ready || moving || resizing) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, width }));
    } catch {
      /* ignore */
    }
  }, [left, width, moving, resizing, ready]);

  const onMovePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      moveRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        originLeft: left,
      };
      setMoving(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [left]
  );

  const onMovePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = moveRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const { width: w, containerW: cw } = layoutRef.current;
      const next = drag.originLeft + (e.clientX - drag.startX);
      setLeft(clampLeft(next, w, cw));
    },
    []
  );

  const onMovePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = moveRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    moveRef.current = null;
    setMoving(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onResizePointerDown = useCallback(
    (edge: "left" | "right") => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const { left: l, width: w, containerW: cw } = layoutRef.current;
      resizeRef.current = {
        pointerId: e.pointerId,
        edge,
        startX: e.clientX,
        originLeft: l,
        originWidth: w,
        containerW: cw,
        pinRight: isFlushRight(l, w, cw),
      };
      setResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    },
    []
  );

  const onResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startX;
      const cw = drag.containerW;

      if (drag.edge === "left") {
        // Keep right edge fixed
        const rightEdge = drag.originLeft + drag.originWidth;
        const nextWidth = clampWidth(drag.originWidth - dx, cw);
        const nextLeft = clampLeft(rightEdge - nextWidth, nextWidth, cw);
        setLeft(nextLeft);
        setWidth(nextWidth);
        return;
      }

      // Right edge
      if (drag.pinRight) {
        // Stay glued to container right while resizing (grow/shrink from the left)
        const nextWidth = clampWidth(drag.originWidth + dx, cw);
        setWidth(nextWidth);
        setLeft(flushRightLeft(nextWidth, cw));
        return;
      }

      const nextWidth = clampWidth(drag.originWidth + dx, cw);
      const nextLeft = clampLeft(drag.originLeft, nextWidth, cw);
      setWidth(nextWidth);
      setLeft(nextLeft);
    },
    []
  );

  const onResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      resizeRef.current = null;
      setResizing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    []
  );

  const animate = !moving && !resizing && !reduceMotion;
  const nearRight = isFlushRight(left, width, containerW);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10">
      <button
        type="button"
        aria-label="Close brief backdrop"
        className="pointer-events-auto absolute inset-0 bg-black/40 lg:bg-black/25"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className="pointer-events-auto absolute top-0 bottom-0 z-20 flex flex-col bg-[var(--bg-elevated)]"
        style={{
          width,
          left,
          right: "auto",
          maxWidth: "100%",
          boxShadow: nearRight
            ? "var(--inset-border), rgba(0,0,0,0.5) -8px 0 24px 0"
            : "var(--inset-border), rgba(0,0,0,0.5) 8px 0 24px 0",
          transition: animate
            ? "width 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
            : undefined,
          userSelect: moving || resizing ? "none" : undefined,
        }}
      >
        <div
          className="flex shrink-0 cursor-grab items-center justify-between border-b border-[var(--border)] px-3 py-2 active:cursor-grabbing"
          style={{ borderBottom: "1px solid var(--border)", touchAction: "none" }}
          onPointerDown={onMovePointerDown}
          onPointerMove={onMovePointerMove}
          onPointerUp={onMovePointerUp}
          onPointerCancel={onMovePointerUp}
        >
          <div className="pointer-events-none flex items-center gap-1.5">
            <GripHorizontal
              className="h-3.5 w-3.5 text-[var(--text-muted)]"
              strokeWidth={1.75}
            />
            <span className="label mb-0">Impact Brief</span>
          </div>
          <Button
            variant="icon"
            aria-label="Close brief"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ImpactBriefPanel item={item} />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize brief from left"
          className="absolute inset-y-0 left-0 z-30 w-1.5 cursor-ew-resize touch-none hover:bg-white/10"
          style={{
            transition: "background 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
          onPointerDown={onResizePointerDown("left")}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize brief from right"
          className="absolute inset-y-0 right-0 z-30 w-1.5 cursor-ew-resize touch-none hover:bg-white/10"
          style={{
            transition: "background 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
          onPointerDown={onResizePointerDown("right")}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      </aside>
    </div>
  );
}
