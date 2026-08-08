"use client";

import { useState, type ReactNode } from "react";

/** Renders an image; if it fails to load, renders nothing (no empty placeholder). */
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
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );

  if (!wrapperClassName && !children) return img;

  return (
    <div className={wrapperClassName}>
      {img}
      {children}
    </div>
  );
}
