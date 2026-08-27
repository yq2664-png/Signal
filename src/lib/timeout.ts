export function timeoutAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
}
