/** Viewport breakpoints matching the previous Tailwind column classes. */
export function columnCountFromWidth(width: number): number {
  if (width >= 1536) return 4;
  if (width >= 1280) return 3;
  if (width >= 640) return 2;
  return 1;
}

/**
 * Round-robin so rank 1..N occupy the first row.
 * CSS `columns` filled top-to-bottom instead, which inflated hit boxes
 * into the empty gaps and hid high-rank cards below the fold.
 */
export function splitIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const count = Math.max(1, Math.floor(columnCount) || 1);
  const columns = Array.from({ length: count }, () => [] as T[]);
  items.forEach((item, index) => {
    columns[index % count].push(item);
  });
  return columns;
}
