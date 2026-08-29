"use client";

import { clsx } from "clsx";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Keeps the media slot while the image loads. Hides the slot only when there
 * is no src or the image fails — so waterfall columns do not collapse empty.
 */
export function SafeImage({
  src,
  alt = "",
  className,
  wrapperClassName,
  children,
}: {
  src?: string;
  alt?: string;
  className?: string;
  /** Optional wrapper around the image (e.g. aspect box). Hidden entirely on error. */
  wrapperClassName?: string;
  children?: ReactNode;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    setFailed(false);
    setLoaded(false);
    const node = imgRef.current;
    if (!node?.complete) return;
    if (node.naturalWidth > 0) setLoaded(true);
    else setFailed(true);
  }, [src]);

  if (!src || failed) return null;

  return (
    <div
      className={clsx(
        "relative overflow-hidden bg-[var(--bg-overlay)]",
        wrapperClassName ?? "inline-block"
      )}
    >
      {!loaded ? (
        <div className="media-skeleton pointer-events-none absolute inset-0" aria-hidden />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={clsx(className, !loaded && "opacity-0")}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {children}
    </div>
  );
}
