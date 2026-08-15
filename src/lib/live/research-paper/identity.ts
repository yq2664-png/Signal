export function stripArxivVersion(raw: string): string {
  const id = raw
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/abs\//i, "")
    .replace(/^arxiv:/i, "")
    .split(/[?#]/)[0];
  return id.replace(/v\d+$/i, "");
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeAuthor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function calendarDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function isWithinWindow(
  submittedAt: string | undefined,
  now: Date,
  windowDays: number
): boolean {
  if (!submittedAt) return false;
  const submitted = new Date(submittedAt);
  if (Number.isNaN(submitted.getTime())) return false;
  const ageMs = now.getTime() - submitted.getTime();
  if (ageMs < 0) return true;
  return ageMs <= windowDays * 24 * 60 * 60 * 1000;
}
