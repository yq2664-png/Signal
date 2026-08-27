/** Changelog adapters fetch `.md`; browsers render that as raw text. */
export function publicReadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.toLowerCase().endsWith(".md")) {
      parsed.pathname = parsed.pathname.slice(0, -3);
    }
    return parsed.toString();
  } catch {
    return url.replace(/\.md(?=(?:#|$))/i, "");
  }
}
