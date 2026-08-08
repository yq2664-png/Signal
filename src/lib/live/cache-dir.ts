import path from "path";

/** Override with CACHE_DIR on Railway (mount a volume there). */
export function getCacheDir() {
  const fromEnv = process.env.CACHE_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), ".cache");
}
