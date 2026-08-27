import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js N indicator. It is not part of SIGNAL and only snaps
  // to the top or bottom edge while covering product chrome.
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
