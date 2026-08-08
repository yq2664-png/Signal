"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import type { Source } from "@/lib/types";

/** Brand-colored SVGs in /public/logos */
const logoSrc: Record<Source, string> = {
  OpenAI: "/logos/openai.svg",
  Anthropic: "/logos/anthropic.svg",
  "Google DeepMind": "/logos/deepmind.svg",
  DeepSeek: "/logos/deepseek.svg",
  Kimi: "/logos/kimi.svg",
  ByteDance: "/logos/bytedance.svg",
  "Black Forest Labs": "/logos/bfl.svg",
  "Hugging Face": "/logos/huggingface.svg",
  arXiv: "/logos/arxiv.svg",
  "Tech Blog": "/logos/medium.svg",
  "Developer Community": "/logos/ycombinator.svg",
  "GitHub · Articles": "/logos/github.svg",
  "GitHub · Skills": "/logos/github.svg",
  "GitHub · Projects": "/logos/github.svg",
  "X (Twitter)": "/logos/x.svg",
  YouTube: "/logos/youtube.svg",
  "Foreign Media": "/logos/rss.svg",
  "Embodied AI": "/logos/embodied.svg",
};

/**
 * Native brand tile colors — the background each mark usually sits on
 * (app icon / favicon style), not a forced white plate.
 */
const logoTile: Record<
  Source,
  { background: string; style?: CSSProperties }
> = {
  OpenAI: { background: "#000000" },
  Anthropic: { background: "#F0EEE5" },
  "Google DeepMind": { background: "#FFFFFF" },
  DeepSeek: { background: "#4D6BFE" },
  Kimi: { background: "#1783FF" },
  ByteDance: { background: "#000000" },
  "Black Forest Labs": { background: "#1a1a1a" },
  "Hugging Face": { background: "#FFD21E" },
  arXiv: { background: "#FFFFFF" },
  "Tech Blog": { background: "#000000" },
  "Developer Community": { background: "#F26522" },
  "GitHub · Articles": { background: "#24292F" },
  "GitHub · Skills": { background: "#1f6feb" },
  "GitHub · Projects": { background: "#24292F" },
  "X (Twitter)": { background: "#000000" },
  YouTube: { background: "#FF0000" },
  "Foreign Media": { background: "#F26522" },
  "Embodied AI": { background: "#0B3D2E" },
};

export function SourceLogo({
  source,
  size = 16,
}: {
  source: Source;
  className?: string;
  size?: number;
}) {
  const src = logoSrc[source];
  const tile = logoTile[source];
  const box = size + 12;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[6px]"
      style={{
        width: box,
        height: box,
        background: tile.background,
        boxShadow: "rgb(35, 37, 42) 0 0 0 1px inset",
        ...tile.style,
      }}
      title={source}
      aria-label={source}
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        unoptimized
      />
    </span>
  );
}
